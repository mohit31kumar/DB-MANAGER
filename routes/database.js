const express = require('express');
const router = express.Router();

router.get('/:name', async (req, res) => {
  if (!req.pool) return res.redirect('/');
  const dbName = req.params.name;
  try {
    const [rows] = await req.pool.query(`SHOW TABLES FROM \`${dbName}\``);
    const tables = rows.map(r => Object.values(r)[0]);
    res.render('database', { dbName, tables, user: req.session.user });
  } catch (err) {
    console.error(err);
    res.render('database', { dbName, tables: [], user: req.session.user, error: err.message });
  }
});

router.post('/create', async (req, res) => {
  if (!req.pool) return res.redirect('/');
  const { name, collation } = req.body;
  if (!name || !name.trim()) return res.redirect('/');
  try {
    const collateClause = collation ? ` COLLATE \`${collation}\`` : '';
    await req.pool.query(`CREATE DATABASE \`${name.trim()}\`${collateClause}`);
    res.redirect('/database/' + encodeURIComponent(name.trim()));
  } catch (err) {
    console.error(err);
    res.redirect('/?error=' + encodeURIComponent(err.message));
  }
});

router.post('/:name/drop', async (req, res) => {
  if (!req.pool) return res.redirect('/');
  const dbName = req.params.name;
  try {
    await req.pool.query(`DROP DATABASE \`${dbName}\``);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.redirect('/?error=' + encodeURIComponent(err.message));
  }
});

router.post('/:name/export', async (req, res) => {
  if (!req.pool) return res.redirect('/');
  const dbName = req.params.name;
  const { format } = req.body;

  try {
    const [tables] = await req.pool.query(`SHOW TABLES FROM \`${dbName}\``);
    const tableNames = tables.map(r => Object.values(r)[0]);

    if (format === 'sql') {
      let sql = `-- Database: ${dbName}\n-- Export: ${new Date().toISOString()}\n\n`;
      sql += `CREATE DATABASE IF NOT EXISTS \`${dbName}\`;\n`;
      sql += `USE \`${dbName}\`;\n\n`;

      for (const table of tableNames) {
        const [createTable] = await req.pool.query(`SHOW CREATE TABLE \`${dbName}\`.\`${table}\``);
        const createSQL = createTable[0]['Create Table'] || '';
        sql += `DROP TABLE IF EXISTS \`${table}\`;\n`;
        sql += createSQL + ';\n\n';

        const [rows] = await req.pool.query(`SELECT * FROM \`${dbName}\`.\`${table}\``);
        const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
        if (rows.length > 0) {
          rows.forEach(row => {
            const vals = columns.map(col => {
              const val = row[col];
              if (val === null) return 'NULL';
              if (typeof val === 'number') return val;
              return "'" + String(val).replace(/'/g, "\\'") + "'";
            });
            sql += `INSERT INTO \`${table}\` (${columns.map(c => '`' + c + '`').join(', ')}) VALUES (${vals.join(', ')});\n`;
          });
          sql += '\n';
        }
      }

      res.setHeader('Content-Type', 'text/sql');
      res.setHeader('Content-Disposition', `attachment; filename=${dbName}.sql`);
      return res.send(sql);
    }

    if (format === 'json') {
      const dump = {};
      for (const table of tableNames) {
        const [rows] = await req.pool.query(`SELECT * FROM \`${dbName}\`.\`${table}\``);
        dump[table] = rows;
      }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${dbName}.json`);
      return res.send(JSON.stringify(dump, null, 2));
    }

    res.status(400).send('Unsupported format.');
  } catch (err) {
    console.error(err);
    res.redirect(`/database/${dbName}?error=` + encodeURIComponent(err.message));
  }
});

module.exports = router;
