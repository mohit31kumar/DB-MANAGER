const express = require('express');
const router = express.Router();

router.use((req, res, next) => {
  if (!req.adapter) return res.redirect('/');
  next();
});

router.get('/:name', async (req, res) => {
  const dbName = req.params.name;
  try {
    const tables = await req.adapter.getTables(dbName);
    res.render('database', { dbName, tables, user: req.session.user, dbType: req.connConfig ? req.connConfig.db_type : null });
  } catch (err) {
    console.error(err);
    res.render('database', { dbName, tables: [], user: req.session.user, error: err.message, dbType: req.connConfig ? req.connConfig.db_type : null });
  }
});

router.post('/create', async (req, res) => {
  const { name, collation } = req.body;
  if (!name || !name.trim()) return res.redirect('/');
  try {
    await req.adapter.createDatabase(name.trim(), collation || undefined);
    res.redirect('/database/' + encodeURIComponent(name.trim()));
  } catch (err) {
    console.error(err);
    res.redirect('/?error=' + encodeURIComponent(err.message));
  }
});

router.post('/:name/drop', async (req, res) => {
  const dbName = req.params.name;
  try {
    await req.adapter.dropDatabase(dbName);
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.redirect('/?error=' + encodeURIComponent(err.message));
  }
});

router.post('/:name/export', async (req, res) => {
  const dbName = req.params.name;
  const { format, scope } = req.body;
  try {
    const result = await req.adapter.exportDatabase(dbName, { format, scope });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename=${result.filename}`);
    return res.send(result.content);
  } catch (err) {
    console.error(err);
    res.redirect(`/database/${dbName}?error=` + encodeURIComponent(err.message));
  }
});

module.exports = router;
