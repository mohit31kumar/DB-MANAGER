const express = require('express');
const router = express.Router();
const store = require('../store');
const { removePool, testConnection } = require('../db');

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.redirect('/login');
}

router.use(requireAuth);

router.get('/', (req, res) => {
  const conns = store.getUserConnections(req.session.user.id);
  const activeId = req.session.connId || null;
  res.render('connections', { conns, activeId, user: req.session.user, error: null, success: null });
});

router.get('/add', (req, res) => {
  const welcome = req.query.welcome === '1';
  res.render('add-connection', { user: req.session.user, error: null, welcome });
});

router.post('/add', (req, res) => {
  const { name, host, port, user: dbUser, password, database, ssl } = req.body;
  if (!name || !host || !dbUser) {
    return res.render('add-connection', { user: req.session.user, error: 'Name, host, and username are required.', welcome: false });
  }
  const userId = req.session.user.id;
  const connId = store.addConnection(userId, {
    name, host, port: parseInt(port) || 3306, user: dbUser, password, database: database || '', ssl: ssl === 'on'
  });
  if (!req.session.connId) {
    req.session.connId = connId;
  }
  res.redirect('/connections');
});

router.get('/:id/edit', (req, res) => {
  const conn = store.getConnectionById(req.session.user.id, parseInt(req.params.id));
  if (!conn) return res.redirect('/connections');
  res.render('edit-connection', { connId: conn.id, conn, user: req.session.user, error: null });
});

router.post('/:id/edit', (req, res) => {
  const connId = parseInt(req.params.id);
  const { name, host, port, user: dbUser, password, database, ssl } = req.body;
  const userId = req.session.user.id;
  const existing = store.getConnectionById(userId, connId);
  if (!existing) return res.redirect('/connections');
  store.updateConnection(userId, connId, {
    name, host, port: parseInt(port) || 3306, user: dbUser, password, database: database || '', ssl: ssl === 'on'
  });
  removePool(userId, connId);
  res.redirect('/connections');
});

router.post('/:id/delete', (req, res) => {
  const connId = parseInt(req.params.id);
  const userId = req.session.user.id;
  removePool(userId, connId);
  store.deleteConnection(userId, connId);
  if (req.session.connId === connId) {
    const remaining = store.getUserConnections(userId);
    req.session.connId = remaining.length > 0 ? remaining[0].id : null;
  }
  res.redirect('/connections');
});

router.post('/:id/activate', (req, res) => {
  const connId = parseInt(req.params.id);
  const userId = req.session.user.id;
  const conn = store.getConnectionById(userId, connId);
  if (!conn) return res.redirect('/connections');
  req.session.connId = connId;
  res.redirect('/');
});

router.post('/test', async (req, res) => {
  const { host, port, user: dbUser, password, database, ssl } = req.body;
  try {
    const result = await testConnection({ host, port, username: dbUser, password, database, ssl });
    const msg = result.note || (result.ssl ? 'Connection successful (SSL enabled).' : 'Connection successful!');
    res.json({ success: true, message: msg });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

module.exports = router;
