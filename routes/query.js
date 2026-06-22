const express = require('express');
const router = express.Router();
const { format } = require('sql-formatter');

router.get('/', async (req, res) => {
  try {
    const [databases] = await req.pool.query('SHOW DATABASES');
    const dbList = databases.map(r => Object.values(r)[0]);
    res.render('query', { user: req.session.user, databases: dbList, query: '', results: null, error: null });
  } catch (err) {
    res.render('query', { user: req.session.user, databases: [], query: '', results: null, error: err.message });
  }
});

router.post('/execute', async (req, res) => {
  const { query: sqlQuery, database } = req.body;
  if (!sqlQuery || !sqlQuery.trim()) {
    return res.json({ error: 'Query cannot be empty.', results: null });
  }

  try {
    if (database) {
      await req.pool.query(`USE \`${database}\``);
    }

    const startTime = Date.now();
    const [rows, fields] = await req.pool.query(sqlQuery);
    const elapsed = Date.now() - startTime;

    if (Array.isArray(rows)) {
      const columns = rows.length > 0 ? Object.keys(rows[0]) : (fields ? fields.map(f => f.name) : []);
      res.json({ results: { columns, rows, affectedRows: rows.length, elapsed }, error: null });
    } else {
      res.json({ results: { columns: [], rows: [], affectedRows: rows.affectedRows, elapsed, message: `Query OK. ${rows.affectedRows} row(s) affected.` }, error: null });
    }
  } catch (err) {
    res.json({ error: err.message, results: null });
  }
});

router.post('/format', (req, res) => {
  const { query: sqlQuery } = req.body;
  try {
    const formatted = format(sqlQuery, { language: 'mysql', keywordCase: 'upper' });
    res.json({ formatted });
  } catch (err) {
    res.json({ error: err.message });
  }
});

router.post('/export', async (req, res) => {
  const { query: sqlQuery, database, format: exportFormat } = req.body;
  if (!sqlQuery) return res.status(400).send('No query provided.');

  try {
    if (database) {
      await req.pool.query(`USE \`${database}\``);
    }
    const [rows] = await req.pool.query(sqlQuery);

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).send('No data to export.');
    }

    const columns = Object.keys(rows[0]);

    if (exportFormat === 'csv') {
      let csv = columns.join(',') + '\n';
      rows.forEach(row => {
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
      return res.send(JSON.stringify(rows, null, 2));
    }

    if (exportFormat === 'sql') {
      let sql = '';
      rows.forEach(row => {
        const vals = columns.map(col => {
          const val = row[col];
          if (val === null) return 'NULL';
          if (typeof val === 'number') return val;
          return "'" + String(val).replace(/'/g, "\\'") + "'";
        });
        sql += `INSERT INTO \`table_name\` (${columns.map(c => '`' + c + '`').join(', ')}) VALUES (${vals.join(', ')});\n`;
      });
      res.setHeader('Content-Type', 'text/sql');
      res.setHeader('Content-Disposition', 'attachment; filename=query_results.sql');
      return res.send(sql);
    }

    res.status(400).send('Unsupported format.');
  } catch (err) {
    res.status(500).send(err.message);
  }
});

module.exports = router;
