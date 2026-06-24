const express = require('express');
const router = express.Router();

router.use((req, res, next) => {
  if (!req.pool) return res.redirect('/');
  next();
});

router.get('/:db/:table/structure', async (req, res) => {
  const { db, table } = req.params;
  try {
    const [columns] = await req.pool.query(`DESCRIBE \`${db}\`.\`${table}\``);
    const [indexes] = await req.pool.query(`SHOW INDEX FROM \`${db}\`.\`${table}\``);
    const [createTable] = await req.pool.query(`SHOW CREATE TABLE \`${db}\`.\`${table}\``);
    const createSQL = createTable[0]['Create Table'] || createTable[0]['Create View'] || '';
    res.render('table/structure', { db, table, columns, indexes, createSQL, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.render('table/structure', { db, table, columns: [], indexes: [], createSQL: '', user: req.session.user, error: err.message });
  }
});

router.get('/:db/:table/browse', async (req, res) => {
  const { db, table } = req.params;
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage) || 25;
  const offset = (page - 1) * perPage;
  const sortCol = req.query.sort || null;
  const sortDir = req.query.dir === 'DESC' ? 'DESC' : 'ASC';

  try {
    const [countResult] = await req.pool.query(`SELECT COUNT(*) as total FROM \`${db}\`.\`${table}\``);
    const totalRows = countResult[0].total;
    const totalPages = Math.ceil(totalRows / perPage);

    let query = `SELECT * FROM \`${db}\`.\`${table}\``;
    if (sortCol) {
      query += ` ORDER BY \`${sortCol}\` ${sortDir}`;
    }
    query += ` LIMIT ${perPage} OFFSET ${offset}`;

    const [rows] = await req.pool.query(query);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    const [pkResult] = await req.pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
      [db, table]
    );
    const primaryKeys = pkResult.map(r => r.COLUMN_NAME);
    const idColumn = primaryKeys.length > 0 ? primaryKeys[0] : (columns.length > 0 ? columns[0] : null);

    res.render('table/browse', {
      db, table, rows, columns, page, perPage, totalPages, totalRows,
      sortCol, sortDir, idColumn, primaryKeys, user: req.session.user
    });
  } catch (err) {
    console.error(err);
    res.render('table/browse', {
      db, table, rows: [], columns: [], page: 1, perPage: 25, totalPages: 0, totalRows: 0,
      sortCol: null, sortDir: 'ASC', idColumn: null, primaryKeys: [], user: req.session.user, error: err.message
    });
  }
});

router.get('/:db/:table/insert', async (req, res) => {
  const { db, table } = req.params;
  try {
    const [columns] = await req.pool.query(`DESCRIBE \`${db}\`.\`${table}\``);
    res.render('table/insert', { db, table, columns, user: req.session.user, error: null, success: null });
  } catch (err) {
    res.render('table/insert', { db, table, columns: [], user: req.session.user, error: err.message, success: null });
  }
});

router.post('/:db/:table/insert', async (req, res) => {
  const { db, table } = req.params;
  try {
    const [columns] = await req.pool.query(`DESCRIBE \`${db}\`.\`${table}\``);
    const fields = [];
    const values = [];

    for (const col of columns) {
      const key = `col_${col.Field}`;
      if (req.body[key + '_null'] === 'on') {
        fields.push(`\`${col.Field}\``);
        values.push(null);
      } else if (req.body[key] !== undefined) {
        fields.push(`\`${col.Field}\``);
        values.push(req.body[key]);
      }
    }

    if (fields.length === 0) {
      return res.render('table/insert', { db, table, columns, user: req.session.user, error: 'No data provided.', success: null });
    }

    const placeholders = values.map(() => '?').join(', ');
    await req.pool.query(`INSERT INTO \`${db}\`.\`${table}\` (${fields.join(', ')}) VALUES (${placeholders})`, values);
    res.redirect(`/table/${db}/${table}/browse`);
  } catch (err) {
    const [columns] = await req.pool.query(`DESCRIBE \`${db}\`.\`${table}\``).catch(() => [[]]);
    res.render('table/insert', { db, table, columns, user: req.session.user, error: err.message, success: null });
  }
});

router.get('/:db/:table/edit/:id', async (req, res) => {
  const { db, table, id } = req.params;
  try {
    const [columns] = await req.pool.query(`DESCRIBE \`${db}\`.\`${table}\``);
    const [pkResult] = await req.pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
      [db, table]
    );
    const primaryKeys = pkResult.map(r => r.COLUMN_NAME);
    const idColumn = primaryKeys.length > 0 ? primaryKeys[0] : columns[0].Field;

    const [rows] = await req.pool.query(`SELECT * FROM \`${db}\`.\`${table}\` WHERE \`${idColumn}\` = ?`, [id]);
    if (rows.length === 0) {
      return res.redirect(`/table/${db}/${table}/browse`);
    }
    res.render('table/edit', { db, table, columns, row: rows[0], idColumn, user: req.session.user, error: null });
  } catch (err) {
    res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/edit/:id', async (req, res) => {
  const { db, table, id } = req.params;
  try {
    const [columns] = await req.pool.query(`DESCRIBE \`${db}\`.\`${table}\``);
    const [pkResult] = await req.pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
      [db, table]
    );
    const primaryKeys = pkResult.map(r => r.COLUMN_NAME);
    const idColumn = primaryKeys.length > 0 ? primaryKeys[0] : columns[0].Field;

    const setClauses = [];
    const values = [];

    for (const col of columns) {
      const key = `col_${col.Field}`;
      if (req.body[key + '_null'] === 'on') {
        setClauses.push(`\`${col.Field}\` = NULL`);
      } else if (req.body[key] !== undefined) {
        setClauses.push(`\`${col.Field}\` = ?`);
        values.push(req.body[key]);
      }
    }

    if (setClauses.length > 0) {
      values.push(id);
      await req.pool.query(`UPDATE \`${db}\`.\`${table}\` SET ${setClauses.join(', ')} WHERE \`${idColumn}\` = ?`, values);
    }

    res.redirect(`/table/${db}/${table}/browse`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/delete/:id', async (req, res) => {
  const { db, table, id } = req.params;
  try {
    const [pkResult] = await req.pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
      [db, table]
    );
    const primaryKeys = pkResult.map(r => r.COLUMN_NAME);
    const idColumn = primaryKeys.length > 0 ? primaryKeys[0] : null;

    if (!idColumn) {
      return res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent('No primary key found.'));
    }

    await req.pool.query(`DELETE FROM \`${db}\`.\`${table}\` WHERE \`${idColumn}\` = ?`, [id]);
    res.redirect(`/table/${db}/${table}/browse`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/delete-multi', async (req, res) => {
  const { db, table } = req.params;
  const { ids } = req.body;
  try {
    const [pkResult] = await req.pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'`,
      [db, table]
    );
    const primaryKeys = pkResult.map(r => r.COLUMN_NAME);
    const idColumn = primaryKeys.length > 0 ? primaryKeys[0] : null;

    if (!idColumn || !ids || ids.length === 0) {
      return res.redirect(`/table/${db}/${table}/browse`);
    }

    const idList = Array.isArray(ids) ? ids : [ids];
    const placeholders = idList.map(() => '?').join(', ');
    await req.pool.query(`DELETE FROM \`${db}\`.\`${table}\` WHERE \`${idColumn}\` IN (${placeholders})`, idList);
    res.redirect(`/table/${db}/${table}/browse`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/truncate', async (req, res) => {
  const { db, table } = req.params;
  try {
    await req.pool.query(`TRUNCATE TABLE \`${db}\`.\`${table}\``);
    res.redirect(`/table/${db}/${table}/browse`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent(err.message));
  }
});

router.get('/:db/:table/structure/add-column', async (req, res) => {
  const { db, table } = req.params;
  try {
    const [columns] = await req.pool.query(`DESCRIBE \`${db}\`.\`${table}\``);
    res.render('table/add-column', { db, table, columns, user: req.session.user, error: null });
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/structure/add-column', async (req, res) => {
  const { db, table } = req.params;
  const { col_name, col_type, col_length, col_null, col_default, col_default_null, col_extra, col_position, col_after } = req.body;
  try {
    let colDef = `\`${col_name}\` ${col_type}`;
    if (col_length) colDef += `(${col_length})`;
    if (col_null !== 'YES') colDef += ' NOT NULL';
    if (col_default_null !== 'on' && col_default !== '') colDef += ` DEFAULT ${col_default === 'NULL' ? 'NULL' : `'${col_default}'`}`;
    if (col_extra) colDef += ` ${col_extra}`;
    let position = '';
    if (col_position === 'after' && col_after) position = ` AFTER \`${col_after}\``;
    else if (col_position === 'first') position = ' FIRST';
    await req.pool.query(`ALTER TABLE \`${db}\`.\`${table}\` ADD COLUMN ${colDef}${position}`);
    res.redirect(`/table/${db}/${table}/structure`);
  } catch (err) {
    const [columns] = await req.pool.query(`DESCRIBE \`${db}\`.\`${table}\``).catch(() => [[]]);
    res.render('table/add-column', { db, table, columns, user: req.session.user, error: err.message });
  }
});

router.post('/:db/:table/structure/drop-column/:col', async (req, res) => {
  const { db, table, col } = req.params;
  try {
    await req.pool.query(`ALTER TABLE \`${db}\`.\`${table}\` DROP COLUMN \`${col}\``);
    res.redirect(`/table/${db}/${table}/structure`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.get('/:db/:table/structure/modify-column/:col', async (req, res) => {
  const { db, table, col } = req.params;
  try {
    const [columns] = await req.pool.query(`DESCRIBE \`${db}\`.\`${table}\``);
    const column = columns.find(c => c.Field === col);
    if (!column) return res.redirect(`/table/${db}/${table}/structure`);
    res.render('table/modify-column', { db, table, columns, column, user: req.session.user, error: null });
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/structure/modify-column/:col', async (req, res) => {
  const { db, table, col } = req.params;
  const { col_name, col_type, col_length, col_null, col_default, col_default_null, col_extra, col_position, col_after } = req.body;
  try {
    let colDef = `\`${col_name}\` ${col_type}`;
    if (col_length) colDef += `(${col_length})`;
    if (col_null !== 'YES') colDef += ' NOT NULL';
    if (col_default_null !== 'on' && col_default !== '') colDef += ` DEFAULT ${col_default === 'NULL' ? 'NULL' : `'${col_default}'`}`;
    if (col_extra) colDef += ` ${col_extra}`;
    let position = '';
    if (col_position === 'after' && col_after) position = ` AFTER \`${col_after}\``;
    else if (col_position === 'first') position = ' FIRST';
    await req.pool.query(`ALTER TABLE \`${db}\`.\`${table}\` MODIFY COLUMN ${colDef}${position}`);
    res.redirect(`/table/${db}/${table}/structure`);
  } catch (err) {
    const [columns] = await req.pool.query(`DESCRIBE \`${db}\`.\`${table}\``).catch(() => [[]]);
    const column = columns.find(c => c.Field === col) || { Field: col, Type: '', Null: 'YES', Default: null, Key: '', Extra: '' };
    res.render('table/modify-column', { db, table, columns, column, user: req.session.user, error: err.message });
  }
});

router.post('/:db/:table/structure/rename', async (req, res) => {
  const { db, table } = req.params;
  const { new_name } = req.body;
  if (!new_name || !new_name.trim()) {
    return res.redirect(`/table/${db}/${table}/structure`);
  }
  try {
    await req.pool.query(`RENAME TABLE \`${db}\`.\`${table}\` TO \`${db}\`.\`${new_name.trim()}\``);
    res.redirect(`/table/${db}/${new_name.trim()}/structure`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/structure/drop', async (req, res) => {
  const { db, table } = req.params;
  try {
    await req.pool.query(`DROP TABLE \`${db}\`.\`${table}\``);
    res.redirect(`/database/${db}`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/structure/change-engine', async (req, res) => {
  const { db, table } = req.params;
  const { engine } = req.body;
  try {
    await req.pool.query(`ALTER TABLE \`${db}\`.\`${table}\` ENGINE = ${engine}`);
    res.redirect(`/table/${db}/${table}/structure`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/structure/change-collation', async (req, res) => {
  const { db, table } = req.params;
  const { collation } = req.body;
  try {
    await req.pool.query(`ALTER TABLE \`${db}\`.\`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE ${collation}`);
    res.redirect(`/table/${db}/${table}/structure`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

module.exports = router;
