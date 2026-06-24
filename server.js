require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const store = require('./store');
const { getPool } = require('./db');

const authRoutes = require('./routes/auth');
const connectionsRoutes = require('./routes/connections');
const indexRoutes = require('./routes/index');
const databaseRoutes = require('./routes/database');
const tableRoutes = require('./routes/table');
const queryRoutes = require('./routes/query');
const importRoutes = require('./routes/import');

const app = express();
const PORT = process.env.APP_PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use((req, res, next) => {
  const isAuthPage = req.path === '/login' || req.path === '/register';
  const isStatic = req.path.startsWith('/css') || req.path.startsWith('/js');

  if (!isAuthPage && !isStatic && (!req.session || !req.session.user)) {
    if (store.getUserCount() === 0) {
      return res.redirect('/register');
    }
    return res.redirect('/login');
  }

  if (req.session && req.session.user) {
    const userId = req.session.user.id;
    const userConns = store.getUserConnections(userId);
    res.locals.userConns = userConns;

    if (!req.session.connId && userConns.length > 0) {
      req.session.connId = userConns[0].id;
    }

    if (req.session.connId) {
      const activeConn = store.getConnectionById(userId, req.session.connId);
      req.connId = req.session.connId;
      req.pool = activeConn ? getPool(userId, req.session.connId) : null;
      req.connConfig = activeConn || null;
      res.locals.connId = req.connId;
      res.locals.connConfig = req.connConfig;
    } else {
      req.connId = null;
      req.pool = null;
      req.connConfig = null;
      res.locals.connId = null;
      res.locals.connConfig = null;
    }
  }

  res.locals.user = req.session ? req.session.user : null;
  next();
});

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

app.use('/', authRoutes);
app.use('/connections', connectionsRoutes);
app.use('/', indexRoutes);
app.use('/database', databaseRoutes);
app.use('/table', tableRoutes);
app.use('/query', queryRoutes);
app.use('/import', importRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.message && err.message.includes('file')) {
    return res.status(400).render('login', { error: err.message, username: '' });
  }
  res.status(500).render('login', { error: 'Something went wrong.', username: '' });
});

app.listen(PORT, () => {
  console.log(`DB Manager is now live.`);
});
