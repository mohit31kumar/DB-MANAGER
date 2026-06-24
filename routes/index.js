const express = require('express');
const router = express.Router();
const store = require('../store');
const { removePool } = require('../db');

router.get('/', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  const userId = req.session.user.id;
  const userConns = store.getUserConnections(userId);

  if (userConns.length === 0) {
    return res.redirect('/connections/add?welcome=1');
  }

  if (!req.pool) {
    return res.render('dashboard', { databases: [], user: req.session.user, error: 'No active connection. Please select one.' });
  }

  try {
    const [rows] = await req.pool.query('SHOW DATABASES');
    const databases = rows.map(r => Object.values(r)[0]);

    let serverInfo = null;
    try {
      const [ver] = await req.pool.query('SELECT VERSION() as version');
      const [uptime] = await req.pool.query('SHOW STATUS LIKE \'Uptime\'');
      serverInfo = {
        version: ver[0].version,
        uptime: uptime[0] ? uptime[0].Value : null
      };
    } catch (e) {}

    res.render('dashboard', { databases, user: req.session.user, serverInfo });
  } catch (err) {
    console.error(err);
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      removePool(userId, req.connId);
      return res.render('dashboard', { databases: [], user: req.session.user, error: 'Could not connect to database server. Connection has been removed. Please add it again.' });
    }
    res.render('dashboard', { databases: [], user: req.session.user, error: err.message });
  }
});

module.exports = router;
