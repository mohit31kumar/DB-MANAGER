const express = require('express');
const router = express.Router();
const store = require('../store');

router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  res.render('login', { error: null, username: '' });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login', { error: 'Username and password are required.', username });
  }

  const user = store.getUser(username);
  if (!user || !store.verifyPassword(password, user.password_hash)) {
    return res.render('login', { error: 'Invalid username or password.', username });
  }

  req.session.user = { id: user.id, username: user.username };
  return res.redirect('/');
});

router.get('/register', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  const hasUsers = store.getUserCount() > 0;
  res.render('register', { error: null, username: '', hasUsers });
});

router.post('/register', async (req, res) => {
  const { username, password, confirm_password } = req.body;
  const hasUsers = store.getUserCount() > 0;

  if (!username || !password) {
    return res.render('register', { error: 'All fields are required.', username, hasUsers });
  }

  if (username.length < 3 || username.length > 30) {
    return res.render('register', { error: 'Username must be 3-30 characters.', username, hasUsers });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.render('register', { error: 'Username can only contain letters, numbers, and underscores.', username, hasUsers });
  }

  if (password.length < 6) {
    return res.render('register', { error: 'Password must be at least 6 characters.', username, hasUsers });
  }

  if (password !== confirm_password) {
    return res.render('register', { error: 'Passwords do not match.', username, hasUsers });
  }

  const existing = store.getUser(username);
  if (existing) {
    return res.render('register', { error: 'Username already taken.', username, hasUsers });
  }

  try {
    store.createUser(username, password);
    const user = store.getUser(username);
    req.session.user = { id: user.id, username: user.username };
    return res.redirect('/connections/add?welcome=1');
  } catch (err) {
    return res.render('register', { error: 'Failed to create account.', username, hasUsers });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
