'use strict';

const { Pool } = require('pg');
const DbAdapter = require('./adapter');

function quoteId(id) {
  return '"' + String(id).replace(/"/g, '""') + '"';
}

function toPgPlaceholders(n) {
  const out = [];
  for (let i = 1; i <= n; i++) out.push('$' + i);
  return out;
}

function getPoolConfig(config) {
  const poolConfig = {
    host: config.host,
    port: config.port || 5432,
    user: config.username || config.user,
    password: config.password,
    database: config.database_name || config.database || undefined,
    connectTimeoutMS: 10000
  };

  if (config.ssl === true || config.ssl === 1 || config.ssl === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  return poolConfig;
}

function normalizeType(col) {
  let type = col.data_type || col.type || 'text';
  if (col.character_maximum_length) {
    type += `(${col.character_maximum_length})`;
  } else if (col.numeric_precision !== null && col.numeric_precision !== undefined) {
    type += `(${col.numeric_precision})`;
  }
  return type;
}

class PostgresAdapter extends DbAdapter {
  constructor(config) {
    super(config);
    this.database = config.database_name || config.database || 'postgres';
    this.pools = {};
    this.pools[this.database] = new Pool(getPoolConfig(config));
  }

  poolFor(db) {
    const name = db || this.database;
    if (this.pools[name]) return this.pools[name];
    const poolConfig = getPoolConfig(this.config);
    poolConfig.database = name;
    this.pools[name] = new Pool(poolConfig);
    return this.pools[name];
  }

  async close() {
    this.closed = true;
    for (const name of Object.keys(this.pools)) {
      try {
        await this.pools[name].end().catch(() => {});
      } catch (e) {}
    }
    this.pools = {};
  }

  async queryRawOn(db, sql, params = []) {
    const res = await this.poolFor(db).query(sql, params);
    return res.rows;
  }

  async queryRaw(sql, params = []) {
    return this.queryRawOn(this.database, sql, params);
  }

  async getDatabases() {
    const rows = await this.queryRaw(`SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname`);
    return rows.map(r => r.datname);
  }

  async getTables(db) {
    const name = db || this.database;
    const rows = await this.queryRawOn(name, `SELECT table_name FROM information_schema.tables WHERE table_catalog = $1 AND table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`, [name]);
    return rows.map(r => r.table_name);
  }

  async getTableStructure(db, table) {
    const columns = await this.queryRawOn(db, `SELECT column_name AS field, data_type AS type, is_nullable AS is_nullable, column_default AS column_default, character_maximum_length, numeric_precision FROM information_schema.columns WHERE table_catalog = $1::text AND table_schema = current_schema() AND table_name = $2::text ORDER BY ordinal_position`, [db, table]);

    const pkColumns = await this.getPrimaryKeys(db, table);
    const pkSet = new Set(pkColumns);

    return columns.map(c => ({
      Field: c.field,
      Type: normalizeType(c),
      Null: c.is_nullable === 'YES' ? 'YES' : 'NO',
      Key: pkSet.has(c.field) ? 'PRI' : '',
      Default: c.column_default === null ? null : c.column_default,
      Extra: ''
    }));
  }

  async getTableIndexes(db, table) {
    const rows = await this.queryRawOn(db, `SELECT ic.relname AS key_name, a.attname AS column_name, ix.indisunique AS is_unique FROM pg_index ix JOIN pg_class t ON t.oid = ix.indrelid JOIN pg_class ic ON ic.oid = ix.indexrelid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) WHERE t.relname = $1::text AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema()) ORDER BY ic.relname, a.attnum`, [table]);
    return rows.map(idx => ({
      Key_name: idx.key_name,
      Column_name: idx.column_name,
      Non_unique: idx.is_unique ? 0 : 1,
      Cardinality: null
    }));
  }

  async getTableCreateSQL(db, table) {
    const columns = await this.queryRawOn(db, `SELECT column_name AS field, data_type AS type, is_nullable AS is_nullable, column_default AS column_default, character_maximum_length, numeric_precision FROM information_schema.columns WHERE table_catalog = $1::text AND table_schema = current_schema() AND table_name = $2::text ORDER BY ordinal_position`, [db, table]);
    if (columns.length === 0) return '';
    const pkColumns = await this.getPrimaryKeys(db, table);
    const pkSet = new Set(pkColumns);
    const parts = columns.map(c => {
      let def = `  ${quoteId(c.field)} ${normalizeType(c)}`;
      if (c.is_nullable !== 'YES') def += ' NOT NULL';
      if (c.column_default !== null && c.column_default !== undefined) def += ` DEFAULT ${c.column_default}`;
      return def;
    });
    let sql = `CREATE TABLE ${quoteId(table)} (\n`;
    sql += parts.join(',\n');
    if (pkColumns.length > 0) {
      sql += ',\n  PRIMARY KEY (' + pkColumns.map(c => quoteId(c)).join(', ') + ')';
    }
    sql += '\n);';
    return sql;
  }

  async getPrimaryKeys(db, table) {
    const rows = await this.queryRawOn(db, `SELECT a.attname AS column_name FROM pg_index ix JOIN pg_class t ON t.oid = ix.indrelid JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey) WHERE t.relname = $1::text AND ix.indisprimary AND t.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())`, [table]);
    return rows.map(r => r.column_name);
  }

  async getTableData(db, table, options = {}) {
    const page = parseInt(options.page) || 1;
    const perPage = parseInt(options.perPage) || 25;
    const offset = (page - 1) * perPage;
    const sortCol = options.sortCol || null;
    const sortDir = options.sortDir === 'DESC' ? 'DESC' : 'ASC';

    const [{ total }] = await this.queryRawOn(db, `SELECT COUNT(*)::text AS total FROM ${quoteId(table)}`);
    const totalRows = parseInt(total, 10);

    let query = `SELECT * FROM ${quoteId(table)}`;
    if (sortCol) {
      query += ` ORDER BY ${quoteId(sortCol)} ${sortDir}`;
    }
    query += ` LIMIT $1 OFFSET $2`;

    const rows = await this.queryRawOn(db, query, [perPage, offset]);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return { rows, columns, totalRows };
  }

  async insertRow(db, table, values) {
    const filtered = {};
    for (const [k, v] of Object.entries(values)) {
      if (v !== null && v !== undefined) filtered[k] = v;
    }
    const columns = Object.keys(filtered);
    const vals = Object.values(filtered);
    const fieldSql = columns.map(c => quoteId(c)).join(', ');
    const placeholders = toPgPlaceholders(columns.length).join(', ');
    await this.queryRawOn(db, `INSERT INTO ${quoteId(table)} (${fieldSql}) VALUES (${placeholders})`, vals);
  }

  async updateRow(db, table, idColumn, id, values) {
    const columns = Object.keys(values);
    const vals = Object.values(values);
    const setSql = columns.map((c, i) => `${quoteId(c)} = $${i + 1}`).join(', ');
    const paramIdx = columns.length + 1;
    await this.queryRawOn(db, `UPDATE ${quoteId(table)} SET ${setSql} WHERE ${quoteId(idColumn)} = $${paramIdx}`, [...vals, id]);
  }

  async deleteRow(db, table, idColumn, id) {
    await this.queryRawOn(db, `DELETE FROM ${quoteId(table)} WHERE ${quoteId(idColumn)} = $1`, [id]);
  }

  async deleteMulti(db, table, idColumn, ids) {
    const idList = Array.isArray(ids) ? ids : [ids];
    if (idList.length === 0) return;
    const placeholders = toPgPlaceholders(idList.length).join(', ');
    await this.queryRawOn(db, `DELETE FROM ${quoteId(table)} WHERE ${quoteId(idColumn)} IN (${placeholders})`, idList);
  }

  async truncate(db, table) {
    await this.queryRawOn(db, `TRUNCATE TABLE ${quoteId(table)}`);
  }

  async createDatabase(name, collation) {
    await this.queryRaw(`CREATE DATABASE ${quoteId(name)}`);
  }

  async dropDatabase(name) {
    await this.queryRaw(`DROP DATABASE ${quoteId(name)}`);
  }

  async renameTable(db, table, newName) {
    await this.queryRawOn(db, `ALTER TABLE ${quoteId(table)} RENAME TO ${quoteId(newName)}`);
  }

  async dropTable(db, table) {
    await this.queryRawOn(db, `DROP TABLE ${quoteId(table)}`);
  }

  async addColumn(db, table, spec) {
    let colDef = `${quoteId(spec.name)} ${spec.type}`;
    if (spec.length) colDef += `(${spec.length})`;
    if (spec.nullable !== 'YES') colDef += ' NOT NULL';
    if (spec.defaultNull !== 'on' && spec.default !== '') {
      colDef += ` DEFAULT ${spec.default === 'NULL' ? 'NULL' : `'${String(spec.default).replace(/'/g, "''")}'`}`;
    }
    if (spec.extra) colDef += ` ${spec.extra}`;
    await this.queryRawOn(db, `ALTER TABLE ${quoteId(table)} ADD COLUMN ${colDef}`);
  }

  async dropColumn(db, table, col) {
    await this.queryRawOn(db, `ALTER TABLE ${quoteId(table)} DROP COLUMN ${quoteId(col)}`);
  }

  async modifyColumn(db, table, col, spec) {
    let colDef = `${quoteId(spec.name)} TYPE ${spec.type}`;
    if (spec.length) colDef += `(${spec.length})`;
    if (spec.nullable !== 'YES') colDef += ' NOT NULL';
    else colDef += ' NULL';
    if (spec.defaultNull !== 'on' && spec.default !== '') {
      colDef += ` DEFAULT ${spec.default === 'NULL' ? 'NULL' : `'${String(spec.default).replace(/'/g, "''")}'`}`;
    } else {
      colDef += ' DEFAULT NULL';
    }
    await this.queryRawOn(db, `ALTER TABLE ${quoteId(table)} ALTER COLUMN ${quoteId(col)} ${colDef}`);
  }

  async changeEngine(db, table, engine) {
    throw new Error('Storage engines are not supported by PostgreSQL.');
  }

  async changeCollation(db, table, collation) {
    throw new Error('Table collation changes are not supported by PostgreSQL.');
  }

  async runQuery(sql) {
    const res = await this.poolFor(this.database).query(sql);
    const rows = res.rows;
    const columns = rows.length > 0 ? Object.keys(rows[0]) : (res.fields ? res.fields.map(f => f.name) : []);
    return { columns, rows, affectedRows: res.rowCount };
  }

  async getRowById(db, table, idColumn, id) {
    const rows = await this.queryRawOn(db, `SELECT * FROM ${quoteId(table)} WHERE ${quoteId(idColumn)} = $1`, [id]);
    return rows[0] || null;
  }

  escapeValue(val) {
    if (val === null) return 'NULL';
    if (typeof val === 'number') return val;
    return "'" + String(val).replace(/'/g, "''") + "'";
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
        const rows = await this.queryRawOn(db, `SELECT * FROM ${quoteId(table)}`);
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
      const columns = await this.queryRawOn(db, `SELECT column_name FROM information_schema.columns WHERE table_catalog = $1::text AND table_schema = current_schema() AND table_name = $2::text ORDER BY ordinal_position`, [db, table]);
      const colNames = columns.map(c => c.column_name);
      let csv = colNames.join(',') + '\n';
      if (!schemaOnly) {
        const rows = await this.queryRawOn(db, `SELECT * FROM ${quoteId(table)}`);
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
        const columns = await this.queryRawOn(db, `SELECT column_name, data_type FROM information_schema.columns WHERE table_catalog = $1::text AND table_schema = current_schema() AND table_name = $2::text ORDER BY ordinal_position`, [db, table]);
        return { content: JSON.stringify({ table, columns }, null, 2), filename: `${table}.json`, contentType: 'application/json' };
      }
      const rows = await this.queryRawOn(db, `SELECT * FROM ${quoteId(table)}`);
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
      for (const table of tables) {
        if (!dataOnly) {
          const createSQL = await this.getTableCreateSQL(db, table);
          sql += `DROP TABLE IF EXISTS ${quoteId(table)};\n`;
          sql += createSQL + ';\n';
        }
        if (!schemaOnly) {
          const rows = await this.queryRawOn(db, `SELECT * FROM ${quoteId(table)}`);
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
          const columns = await this.queryRawOn(db, `SELECT column_name, data_type FROM information_schema.columns WHERE table_catalog = $1::text AND table_schema = current_schema() AND table_name = $2::text ORDER BY ordinal_position`, [db, table]);
          dump[table] = { columns };
        } else {
          const rows = await this.queryRawOn(db, `SELECT * FROM ${quoteId(table)}`);
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
      const ver = await this.queryRaw(`SELECT version() AS version`);
      version = ver[0].version;
    } catch (e) {}
    try {
      const up = await this.queryRaw(`SELECT EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time()))::text AS uptime`);
      uptime = up[0] ? up[0].uptime : null;
    } catch (e) {}
    return { version, uptime };
  }
}

module.exports = PostgresAdapter;
