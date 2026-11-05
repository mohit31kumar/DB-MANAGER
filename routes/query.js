const express = require('express');
const router = express.Router();
const { format } = require('sql-formatter');

router.use((req, res, next) => {
  if (!req.adapter) return res.redirect('/');
  next();
});

router.get('/', async (req, res) => {
  try {
    const databases = await req.adapter.getDatabases();
    res.render('query', {
      user: req.session.user,
      databases,
      query: '',
      results: null,
      error: null,
      dbType: req.connConfig ? req.connConfig.db_type : null
    });
  } catch (err) {
    res.render('query', {
      user: req.session.user,
      databases: [],
      query: '',
      results: null,
      error: err.message,
      dbType: req.connConfig ? req.connConfig.db_type : null
    });
  }
});

router.post('/execute', async (req, res) => {
  const { query: sqlQuery, database, disableFK } = req.body;
  if (!sqlQuery || !sqlQuery.trim()) {
    return res.json({ error: 'Query cannot be empty.', results: null });
  }

  try {
    if (database && req.connConfig && req.connConfig.db_type === 'mysql') {
      await req.adapter.runQuery(`USE \`${database.replace(/`/g, '``')}\``);
    }

    const startTime = Date.now();
    const result = await req.adapter.runQuery(sqlQuery);
    const elapsed = Date.now() - startTime;

    res.json({
      results: {
        columns: result.columns,
        rows: result.rows,
        affectedRows: result.affectedRows,
        elapsed,
        message: result.message || `Query OK. ${result.affectedRows} row(s) affected.`
      },
      error: null
    });
  } catch (err) {
    res.json({ error: err.message, results: null });
  }
});

router.post('/format', (req, res) => {
  const { query: sqlQuery } = req.body;
  try {
    const language = (req.connConfig && req.connConfig.db_type === 'postgres') ? 'postgresql' : 'mysql';
    const formatted = format(sqlQuery, { language, keywordCase: 'upper' });
    res.json({ formatted });
  } catch (err) {
    res.json({ error: err.message });
  }
});

router.post('/export', async (req, res) => {
  const { query: sqlQuery, database, format: exportFormat } = req.body;
  if (!sqlQuery) return res.status(400).send('No query provided.');

  try {
    if (database && req.connConfig && req.connConfig.db_type === 'mysql') {
      await req.adapter.runQuery(`USE \`${database.replace(/`/g, '``')}\``);
    }
    const result = await req.adapter.runQuery(sqlQuery);

    if (!result.rows || result.rows.length === 0) {
      return res.status(404).send('No data to export.');
    }

    const columns = result.columns;
    const quoteId = req.adapter.quoteId.bind(req.adapter);
    const escapeValue = req.adapter.escapeValue.bind(req.adapter);

    if (exportFormat === 'csv') {
      let csv = columns.join(',') + '\n';
      result.rows.forEach(row => {
        csv += columns.map(col => {
          const val = row[col];
          if (val === null) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? '"' + str.replace(/"/g, '""') + '"'
            : str;
        }).join(',') + '\n';
      });
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=query_results.csv');
      return res.send(csv);
    }

    if (exportFormat === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=query_results.json');
      return res.send(JSON.stringify(result.rows, null, 2));
    }

    if (exportFormat === 'sql') {
      let tableName = 'table_name';
      const fromMatch = sqlQuery.match(/FROM\s+"?(\w+)"?/i);
      const intoMatch = sqlQuery.match(/INTO\s+"?(\w+)"?/i);
      const updateMatch = sqlQuery.match(/UPDATE\s+"?(\w+)"?/i);
      if (fromMatch) tableName = fromMatch[1];
      else if (intoMatch) tableName = intoMatch[1];
      else if (updateMatch) tableName = updateMatch[1];

      let sql = '';
      result.rows.forEach(row => {
        const vals = columns.map(col => escapeValue(row[col]));
        sql += `INSERT INTO ${quoteId(tableName)} (${columns.map(c => quoteId(c)).join(', ')}) VALUES (${vals.join(', ')});\n`;
      });
      res.setHeader('Content-Type', 'text/sql');
      res.setHeader('Content-Disposition', `attachment; filename=${tableName}_results.sql`);
      return res.send(sql);
    }

    res.status(400).send('Unsupported format.');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;
