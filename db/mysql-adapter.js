'use strict';

const mysql = require('mysql2/promise');
const DbAdapter = require('./adapter');

function quoteId(id) {
  return '`' + String(id).replace(/`/g, '``') + '`';
}

function getPoolConfig(config) {
  const poolConfig = {
    host: config.host,
    port: config.port || 3306,
    user: config.username || config.user,
    password: config.password,
    database: config.database_name || config.database || undefined,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true,
    dateStrings: true,
    connectTimeout: 10000
  };

  if (config.ssl === true || config.ssl === 1 || config.ssl === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  return poolConfig;
}

class MySqlAdapter extends DbAdapter {
  constructor(config) {
    super(config);
    this.pool = mysql.createPool(getPoolConfig(config));
  }

  async close() {
    this.closed = true;
    if (this.pool) {
      await this.pool.end().catch(() => {});
    }
  }

  async queryRaw(sql, params = []) {
    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  async getDatabases() {
    const rows = await this.queryRaw('SHOW DATABASES');
    return rows.map(r => Object.values(r)[0]);
  }

  async getTables(db) {
    const rows = await this.queryRaw(`SHOW TABLES FROM ${quoteId(db)}`);
    return rows.map(r => Object.values(r)[0]);
  }

  async getTableStructure(db, table) {
    const columns = await this.queryRaw(`DESCRIBE ${quoteId(db)}.${quoteId(table)}`);
    return columns.map(c => ({
      Field: c.Field,
      Type: c.Type,
      Null: c.Null,
      Key: c.Key || '',
      Default: c.Default,
      Extra: c.Extra || ''
    }));
  }

  async getTableIndexes(db, table) {
    const rows = await this.queryRaw(`SHOW INDEX FROM ${quoteId(db)}.${quoteId(table)}`);
    return rows.map(idx => ({
      Key_name: idx.Key_name,
      Column_name: idx.Column_name,
      Non_unique: idx.Non_unique,
      Cardinality: idx.Cardinality
    }));
  }

  async getTableCreateSQL(db, table) {
    const rows = await this.queryRaw(`SHOW CREATE TABLE ${quoteId(db)}.${quoteId(table)}`);
    return rows[0]['Create Table'] || rows[0]['Create View'] || '';
  }

  async getPrimaryKeys(db, table) {
    const rows = await this.queryRaw(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
      [db, table]
    );
    return rows.map(r => r.COLUMN_NAME);
  }

  async getTableData(db, table, options = {}) {
    const page = parseInt(options.page) || 1;
    const perPage = parseInt(options.perPage) || 25;
    const offset = (page - 1) * perPage;
    const sortCol = options.sortCol || null;
    const sortDir = options.sortDir === 'DESC' ? 'DESC' : 'ASC';

    const [[countResult]] = await this.pool.query(`SELECT COUNT(*) as total FROM ${quoteId(db)}.${quoteId(table)}`);
    const totalRows = countResult.total;

    let query = `SELECT * FROM ${quoteId(db)}.${quoteId(table)}`;
    if (sortCol) {
      query += ` ORDER BY ${quoteId(sortCol)} ${sortDir}`;
    }
    query += ` LIMIT ? OFFSET ?`;

    const rows = await this.queryRaw(query, [perPage, offset]);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return { rows, columns, totalRows };
  }

  async insertRow(db, table, values) {
    const columns = Object.keys(values);
    const vals = Object.values(values);
    const fieldSql = columns.map(c => quoteId(c)).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    await this.queryRaw(`INSERT INTO ${quoteId(db)}.${quoteId(table)} (${fieldSql}) VALUES (${placeholders})`, vals);
  }

  async updateRow(db, table, idColumn, id, values) {
    const columns = Object.keys(values);
    const vals = Object.values(values);
    const setSql = columns.map(c => `${quoteId(c)} = ?`).join(', ');
    await this.queryRaw(`UPDATE ${quoteId(db)}.${quoteId(table)} SET ${setSql} WHERE ${quoteId(idColumn)} = ?`, [...vals, id]);
  }

  async deleteRow(db, table, idColumn, id) {
    await this.queryRaw(`DELETE FROM ${quoteId(db)}.${quoteId(table)} WHERE ${quoteId(idColumn)} = ?`, [id]);
  }

  async deleteMulti(db, table, idColumn, ids) {
    const idList = Array.isArray(ids) ? ids : [ids];
    if (idList.length === 0) return;
    const placeholders = idList.map(() => '?').join(', ');
    await this.queryRaw(`DELETE FROM ${quoteId(db)}.${quoteId(table)} WHERE ${quoteId(idColumn)} IN (${placeholders})`, idList);
  }

  async truncate(db, table) {
    await this.queryRaw(`TRUNCATE TABLE ${quoteId(db)}.${quoteId(table)}`);
  }

  async createDatabase(name, collation) {
    const collateClause = collation ? ` COLLATE ${quoteId(collation)}` : '';
    await this.queryRaw(`CREATE DATABASE ${quoteId(name)}${collateClause}`);
  }

  async dropDatabase(name) {
    await this.queryRaw(`DROP DATABASE ${quoteId(name)}`);
  }

  async renameTable(db, table, newName) {
    await this.queryRaw(`RENAME TABLE ${quoteId(db)}.${quoteId(table)} TO ${quoteId(db)}.${quoteId(newName)}`);
  }

  async dropTable(db, table) {
    await this.queryRaw(`DROP TABLE ${quoteId(db)}.${quoteId(table)}`);
  }

  async addColumn(db, table, spec) {
    let colDef = `${quoteId(spec.name)} ${spec.type}`;
    if (spec.length) colDef += `(${spec.length})`;
    if (spec.nullable !== 'YES') colDef += ' NOT NULL';
    if (spec.defaultNull !== 'on' && spec.default !== '') {
      colDef += ` DEFAULT ${spec.default === 'NULL' ? 'NULL' : `'${String(spec.default).replace(/'/g, "''")}'`}`;
    }
    if (spec.extra) colDef += ` ${spec.extra}`;
    let position = '';
    if (spec.position === 'after' && spec.after) position = ` AFTER ${quoteId(spec.after)}`;
    else if (spec.position === 'first') position = ' FIRST';
    await this.queryRaw(`ALTER TABLE ${quoteId(db)}.${quoteId(table)} ADD COLUMN ${colDef}${position}`);
  }

  async dropColumn(db, table, col) {
    await this.queryRaw(`ALTER TABLE ${quoteId(db)}.${quoteId(table)} DROP COLUMN ${quoteId(col)}`);
  }

  async modifyColumn(db, table, col, spec) {
    let colDef = `${quoteId(spec.name)} ${spec.type}`;
    if (spec.length) colDef += `(${spec.length})`;
    if (spec.nullable !== 'YES') colDef += ' NOT NULL';
    if (spec.defaultNull !== 'on' && spec.default !== '') {
      colDef += ` DEFAULT ${spec.default === 'NULL' ? 'NULL' : `'${String(spec.default).replace(/'/g, "''")}'`}`;
    }
    if (spec.extra) colDef += ` ${spec.extra}`;
    let position = '';
    if (spec.position === 'after' && spec.after) position = ` AFTER ${quoteId(spec.after)}`;
    else if (spec.position === 'first') position = ' FIRST';
    await this.queryRaw(`ALTER TABLE ${quoteId(db)}.${quoteId(table)} MODIFY COLUMN ${colDef}${position}`);
  }

  async changeEngine(db, table, engine) {
    await this.queryRaw(`ALTER TABLE ${quoteId(db)}.${quoteId(table)} ENGINE = ${engine}`);
  }

  async changeCollation(db, table, collation) {
    await this.queryRaw(`ALTER TABLE ${quoteId(db)}.${quoteId(table)} CONVERT TO CHARACTER SET utf8mb4 COLLATE ${collation}`);
  }

  async runQuery(sql) {
    const [rows, fields] = await this.pool.query(sql);
    if (Array.isArray(rows)) {
      const columns = rows.length > 0 ? Object.keys(rows[0]) : (fields ? fields.map(f => f.name) : []);
      return { columns, rows, affectedRows: rows.length };
    }
    return {
      columns: [],
      rows: [],
      affectedRows: rows.affectedRows,
      message: `Query OK. ${rows.affectedRows} row(s) affected.`
    };
  }

  async getRowById(db, table, idColumn, id) {
    const rows = await this.queryRaw(`SELECT * FROM ${quoteId(db)}.${quoteId(table)} WHERE ${quoteId(idColumn)} = ?`, [id]);
    return rows[0] || null;
  }

  escapeValue(val) {
    if (val === null) return 'NULL';
    if (typeof val === 'number') return val;
    return "'" + String(val).replace(/'/g, "\\'") + "'";
  }

  async exportTable(db, table, options = {}) {
    const schemaOnly = options.scope === 'schema';
    const dataOnly = options.scope === 'data';

    if (options.format === 'sql') {
      let sql = `-- Database: ${db}\n-- Table: ${table}\n\n`;
      if (!dataOnly) {
        const createSQL = await this.getTableCreateSQL(db, table);
        sql += `DROP TABLE IF EXISTS ${quoteId(table)};\n`;
        sql += createSQL + ';\n';
      }
      if (!schemaOnly) {
        const [rows] = await this.pool.query(`SELECT * FROM ${quoteId(db)}.${quoteId(table)}`);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        if (rows.length > 0) {
          sql += '\n';
          rows.forEach(row => {
            const vals = columns.map(col => this.escapeValue(row[col]));
            sql += `INSERT INTO ${quoteId(table)} (${columns.map(c => quoteId(c)).join(', ')}) VALUES (${vals.join(', ')});\n`;
          });
        }
      }
      sql += '\n';
      return { content: sql, filename: `${table}.sql`, contentType: 'text/sql' };
    }

    if (options.format === 'csv') {
      const [columns] = await this.pool.query(`SHOW COLUMNS FROM ${quoteId(db)}.${quoteId(table)}`);
      const colNames = columns.map(c => c.Field);
      let csv = colNames.join(',') + '\n';
      if (!schemaOnly) {
        const [rows] = await this.pool.query(`SELECT * FROM ${quoteId(db)}.${quoteId(table)}`);
        rows.forEach(row => {
          csv += colNames.map(col => {
            const val = row[col];
            if (val === null) return '';
            const str = String(val);
            return str.includes(',') || str.includes('"') || str.includes('\n')
              ? '"' + str.replace(/"/g, '""') + '"'
              : str;
          }).join(',') + '\n';
        });
      }
      return { content: csv, filename: `${table}.csv`, contentType: 'text/csv' };
    }

    if (options.format === 'json') {
      if (schemaOnly) {
        const [columns] = await this.pool.query(`SHOW COLUMNS FROM ${quoteId(db)}.${quoteId(table)}`);
        return { content: JSON.stringify({ table, columns }, null, 2), filename: `${table}.json`, contentType: 'application/json' };
      }
      const [rows] = await this.pool.query(`SELECT * FROM ${quoteId(db)}.${quoteId(table)}`);
      return { content: JSON.stringify(rows, null, 2), filename: `${table}.json`, contentType: 'application/json' };
    }

    throw new Error('Unsupported format.');
  }

  async exportDatabase(db, options = {}) {
    const schemaOnly = options.scope === 'schema';
    const dataOnly = options.scope === 'data';

    if (options.format === 'sql') {
      const tables = await this.getTables(db);
      let sql = `-- Database: ${db}\n-- Export: ${new Date().toISOString()}\n\n`;
      if (!dataOnly) {
        sql += `CREATE DATABASE IF NOT EXISTS ${quoteId(db)};\n`;
        sql += `USE ${quoteId(db)};\n\n`;
      }
      for (const table of tables) {
        if (!dataOnly) {
          const createSQL = await this.getTableCreateSQL(db, table);
          sql += `DROP TABLE IF EXISTS ${quoteId(table)};\n`;
          sql += createSQL + ';\n';
        }
        if (!schemaOnly) {
          const [rows] = await this.pool.query(`SELECT * FROM ${quoteId(db)}.${quoteId(table)}`);
          const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
          if (rows.length > 0) {
            sql += '\n';
            rows.forEach(row => {
              const vals = columns.map(col => this.escapeValue(row[col]));
              sql += `INSERT INTO ${quoteId(table)} (${columns.map(c => quoteId(c)).join(', ')}) VALUES (${vals.join(', ')});\n`;
            });
          }
        }
        sql += '\n';
      }
      return { content: sql, filename: `${db}.sql`, contentType: 'text/sql' };
    }

    if (options.format === 'json') {
      const tables = await this.getTables(db);
      const dump = {};
      for (const table of tables) {
        if (schemaOnly) {
          const [columns] = await this.pool.query(`SHOW COLUMNS FROM ${quoteId(db)}.${quoteId(table)}`);
          dump[table] = { columns };
        } else {
          const [rows] = await this.pool.query(`SELECT * FROM ${quoteId(db)}.${quoteId(table)}`);
          dump[table] = rows;
        }
      }
      return { content: JSON.stringify(dump, null, 2), filename: `${db}.json`, contentType: 'application/json' };
    }

    throw new Error('Unsupported format.');
  }

  async getServerInfo() {
    let version = null;
    let uptime = null;
    try {
      const [ver] = await this.queryRaw('SELECT VERSION() as version');
      version = ver[0].version;
    } catch (e) {}
    try {
      const [upt] = await this.queryRaw("SHOW STATUS LIKE 'Uptime'");
      uptime = upt[0] ? upt[0].Value : null;
    } catch (e) {}
    return { version, uptime };
  }
}

module.exports = MySqlAdapter;
