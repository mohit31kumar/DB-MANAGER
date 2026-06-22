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

module.exports = router;
