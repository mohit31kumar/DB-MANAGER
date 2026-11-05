const express = require('express');
const router = express.Router();
const store = require('../store');
const { removePool, getAdapter } = require('../db');

router.get('/', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  const userId = req.session.user.id;
  const userConns = await store.getUserConnections(userId);

  if (userConns.length === 0) {
    return res.redirect('/connections/add?welcome=1');
  }

  if (!req.adapter) {
    return res.render('dashboard', { databases: [], user: req.session.user, error: 'No active connection. Please select one.', dbType: null });
  }

  try {
    const databases = await req.adapter.getDatabases();

    let serverInfo = null;
    try {
      serverInfo = await req.adapter.getServerInfo();
    } catch (e) {}

    res.render('dashboard', { databases, user: req.session.user, serverInfo, dbType: req.connConfig ? req.connConfig.db_type : null });
  } catch (err) {
    if (err.message === 'Pool is closed.' || err.message && err.message.includes('pool')) {
      removePool(userId, req.connId);
      req.adapter = await getAdapter(userId, req.connId);
      if (req.adapter) {
        try {
          const databases = await req.adapter.getDatabases();
          return res.render('dashboard', { databases, user: req.session.user, serverInfo: null, dbType: req.connConfig ? req.connConfig.db_type : null });
        } catch (retryErr) {
          console.error(retryErr);
        }
      }
      return res.render('dashboard', { databases: [], user: req.session.user, error: 'Connection pool was refreshed. Please try again.', dbType: null });
    }
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      removePool(userId, req.connId);
      return res.render('dashboard', { databases: [], user: req.session.user, error: 'Could not connect to database server. Connection has been removed. Please add it again.', dbType: null });
    }
    console.error(err);
    res.render('dashboard', { databases: [], user: req.session.user, error: err.message, dbType: null });
  }
});

module.exports = router;
