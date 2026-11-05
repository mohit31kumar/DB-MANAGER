const express = require('express');
const router = express.Router();

router.use((req, res, next) => {
  if (!req.adapter) return res.redirect('/');
  next();
});

function buildValuesFromBody(req, columns) {
  const values = {};
  for (const col of columns) {
    const key = `col_${col.Field}`;
    if (req.body[key + '_null'] === 'on') {
      values[col.Field] = null;
    } else if (req.body[key] !== undefined) {
      values[col.Field] = req.body[key];
    }
  }
  return values;
}

router.get('/:db/:table/structure', async (req, res) => {
  const { db, table } = req.params;
  try {
    const columns = await req.adapter.getTableStructure(db, table);
    const indexes = await req.adapter.getTableIndexes(db, table);
    const createSQL = await req.adapter.getTableCreateSQL(db, table);
    res.render('table/structure', {
      db, table, columns, indexes, createSQL, user: req.session.user,
      dbType: req.connConfig ? req.connConfig.db_type : null
    });
  } catch (err) {
    console.error(err);
    res.render('table/structure', {
      db, table, columns: [], indexes: [], createSQL: '', user: req.session.user, error: err.message,
      dbType: req.connConfig ? req.connConfig.db_type : null
    });
  }
});

router.get('/:db/:table/browse', async (req, res) => {
  const { db, table } = req.params;
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(req.query.perPage) || 25;
  const sortCol = req.query.sort || null;
  const sortDir = req.query.dir === 'DESC' ? 'DESC' : 'ASC';

  try {
    const { rows, columns, totalRows } = await req.adapter.getTableData(db, table, { page, perPage, sortCol, sortDir });
    const totalPages = Math.ceil(totalRows / perPage);

    const primaryKeys = await req.adapter.getPrimaryKeys(db, table);
    const idColumn = primaryKeys.length > 0 ? primaryKeys[0] : (columns.length > 0 ? columns[0] : null);

    res.render('table/browse', {
      db, table, rows, columns, page, perPage, totalPages, totalRows,
      sortCol, sortDir, idColumn, primaryKeys, user: req.session.user,
      dbType: req.connConfig ? req.connConfig.db_type : null
    });
  } catch (err) {
    console.error(err);
    res.render('table/browse', {
      db, table, rows: [], columns: [], page: 1, perPage: 25, totalPages: 0, totalRows: 0,
      sortCol: null, sortDir: 'ASC', idColumn: null, primaryKeys: [], user: req.session.user, error: err.message,
      dbType: req.connConfig ? req.connConfig.db_type : null
    });
  }
});

router.get('/:db/:table/insert', async (req, res) => {
  const { db, table } = req.params;
  try {
    const columns = await req.adapter.getTableStructure(db, table);
    res.render('table/insert', { db, table, columns, user: req.session.user, error: null, success: null,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  } catch (err) {
    res.render('table/insert', { db, table, columns: [], user: req.session.user, error: err.message, success: null,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  }
});

router.post('/:db/:table/insert', async (req, res) => {
  const { db, table } = req.params;
  try {
    const columns = await req.adapter.getTableStructure(db, table);
    const values = buildValuesFromBody(req, columns);

    const keys = Object.keys(values);
    if (keys.length === 0) {
      return res.render('table/insert', { db, table, columns, user: req.session.user, error: 'No data provided.', success: null,
        dbType: req.connConfig ? req.connConfig.db_type : null });
    }

    await req.adapter.insertRow(db, table, values);
    res.redirect(`/table/${db}/${table}/browse`);
  } catch (err) {
    const columns = await req.adapter.getTableStructure(db, table).catch(() => [[]]);
    res.render('table/insert', { db, table, columns, user: req.session.user, error: err.message, success: null,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  }
});

router.get('/:db/:table/edit/:id', async (req, res) => {
  const { db, table, id } = req.params;
  try {
    const columns = await req.adapter.getTableStructure(db, table);
    const primaryKeys = await req.adapter.getPrimaryKeys(db, table);
    const idColumn = primaryKeys.length > 0 ? primaryKeys[0] : (columns.length > 0 ? columns[0].Field : null);

    if (!idColumn) {
      return res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent('No primary key found.'));
    }

    const row = await req.adapter.getRowById(db, table, idColumn, id);
    if (!row) {
      return res.redirect(`/table/${db}/${table}/browse`);
    }
    res.render('table/edit', { db, table, columns, row, idColumn, user: req.session.user, error: null,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  } catch (err) {
    res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/edit/:id', async (req, res) => {
  const { db, table, id } = req.params;
  try {
    const columns = await req.adapter.getTableStructure(db, table);
    const primaryKeys = await req.adapter.getPrimaryKeys(db, table);
    const idColumn = primaryKeys.length > 0 ? primaryKeys[0] : (columns.length > 0 ? columns[0].Field : null);

    const values = buildValuesFromBody(req, columns);

    if (Object.keys(values).length > 0) {
      await req.adapter.updateRow(db, table, idColumn, id, values);
    }

    res.redirect(`/table/${db}/${table}/browse`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/delete/:id', async (req, res) => {
  const { db, table, id } = req.params;
  try {
    const primaryKeys = await req.adapter.getPrimaryKeys(db, table);
    const idColumn = primaryKeys.length > 0 ? primaryKeys[0] : null;

    if (!idColumn) {
      return res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent('No primary key found.'));
    }

    await req.adapter.deleteRow(db, table, idColumn, id);
    res.redirect(`/table/${db}/${table}/browse`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/delete-multi', async (req, res) => {
  const { db, table } = req.params;
  const { ids } = req.body;
  try {
    const primaryKeys = await req.adapter.getPrimaryKeys(db, table);
    const idColumn = primaryKeys.length > 0 ? primaryKeys[0] : null;

    if (!idColumn || !ids || ids.length === 0) {
      return res.redirect(`/table/${db}/${table}/browse`);
    }

    const idList = Array.isArray(ids) ? ids : [ids];
    await req.adapter.deleteMulti(db, table, idColumn, idList);
    res.redirect(`/table/${db}/${table}/browse`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/truncate', async (req, res) => {
  const { db, table } = req.params;
  try {
    await req.adapter.truncate(db, table);
    res.redirect(`/table/${db}/${table}/browse`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/browse?error=` + encodeURIComponent(err.message));
  }
});

router.get('/:db/:table/structure/add-column', async (req, res) => {
  const { db, table } = req.params;
  try {
    const columns = await req.adapter.getTableStructure(db, table);
    res.render('table/add-column', { db, table, columns, user: req.session.user, error: null,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/structure/add-column', async (req, res) => {
  const { db, table } = req.params;
  const { col_name, col_type, col_length, col_null, col_default, col_default_null, col_extra, col_position, col_after } = req.body;
  try {
    await req.adapter.addColumn(db, table, {
      name: col_name, type: col_type, length: col_length, nullable: col_null,
      default: col_default, defaultNull: col_default_null, extra: col_extra,
      position: col_position, after: col_after
    });
    res.redirect(`/table/${db}/${table}/structure`);
  } catch (err) {
    const columns = await req.adapter.getTableStructure(db, table).catch(() => [[]]);
    res.render('table/add-column', { db, table, columns, user: req.session.user, error: err.message,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  }
});

router.post('/:db/:table/structure/drop-column/:col', async (req, res) => {
  const { db, table, col } = req.params;
  try {
    await req.adapter.dropColumn(db, table, col);
    res.redirect(`/table/${db}/${table}/structure`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.get('/:db/:table/structure/modify-column/:col', async (req, res) => {
  const { db, table, col } = req.params;
  try {
    const columns = await req.adapter.getTableStructure(db, table);
    const column = columns.find(c => c.Field === col);
    if (!column) return res.redirect(`/table/${db}/${table}/structure`);
    res.render('table/modify-column', { db, table, columns, column, user: req.session.user, error: null,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/structure/modify-column/:col', async (req, res) => {
  const { db, table, col } = req.params;
  const { col_name, col_type, col_length, col_null, col_default, col_default_null, col_extra, col_position, col_after } = req.body;
  try {
    await req.adapter.modifyColumn(db, table, col, {
      name: col_name, type: col_type, length: col_length, nullable: col_null,
      default: col_default, defaultNull: col_default_null, extra: col_extra,
      position: col_position, after: col_after
    });
    res.redirect(`/table/${db}/${table}/structure`);
  } catch (err) {
    const columns = await req.adapter.getTableStructure(db, table).catch(() => [[]]);
    const column = columns.find(c => c.Field === col) || { Field: col, Type: '', Null: 'YES', Default: null, Key: '', Extra: '' };
    res.render('table/modify-column', { db, table, columns, column, user: req.session.user, error: err.message,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  }
});

router.post('/:db/:table/structure/rename', async (req, res) => {
  const { db, table } = req.params;
  const { new_name } = req.body;
  if (!new_name || !new_name.trim()) {
    return res.redirect(`/table/${db}/${table}/structure`);
  }
  try {
    await req.adapter.renameTable(db, table, new_name.trim());
    res.redirect(`/table/${db}/${new_name.trim()}/structure`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/structure/drop', async (req, res) => {
  const { db, table } = req.params;
  try {
    await req.adapter.dropTable(db, table);
    res.redirect(`/database/${db}`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/structure/change-engine', async (req, res) => {
  const { db, table } = req.params;
  const { engine } = req.body;
  try {
    await req.adapter.changeEngine(db, table, engine);
    res.redirect(`/table/${db}/${table}/structure`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.post('/:db/:table/structure/change-collation', async (req, res) => {
  const { db, table } = req.params;
  const { collation } = req.body;
  try {
    await req.adapter.changeCollation(db, table, collation);
    res.redirect(`/table/${db}/${table}/structure`);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/structure?error=` + encodeURIComponent(err.message));
  }
});

router.get('/:db/:table/export', async (req, res) => {
  const { db, table } = req.params;
  res.render('table/export', { db, table, user: req.session.user, error: null,
    dbType: req.connConfig ? req.connConfig.db_type : null });
});

router.post('/:db/:table/export', async (req, res) => {
  const { db, table } = req.params;
  const { format, scope } = req.body;
  try {
    const result = await req.adapter.exportTable(db, table, { format, scope });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
    return res.send(result.content);
  } catch (err) {
    res.redirect(`/table/${db}/${table}/export?error=` + encodeURIComponent(err.message));
  }
});

module.exports = router;
