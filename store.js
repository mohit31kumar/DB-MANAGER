const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');

const db = new Database(path.join(__dirname, 'users.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    host TEXT NOT NULL,
    port INTEGER DEFAULT 3306,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    database_name TEXT DEFAULT '',
    ssl INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saved_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    query_text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

function getUserCount() {
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
  return row.count;
}

function createUser(username, password) {
  const hash = bcrypt.hashSync(password, 10);
  const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
  const result = stmt.run(username, hash);
  return result.lastInsertRowid;
}

function getUser(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserById(id) {
  return db.prepare('SELECT id, username, created_at FROM users WHERE id = ?').get(id);
}

function verifyPassword(plainPassword, hash) {
  return bcrypt.compareSync(plainPassword, hash);
}

function addConnection(userId, data) {
  const stmt = db.prepare(
    'INSERT INTO connections (user_id, name, host, port, username, password, database_name, ssl) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(userId, data.name, data.host, data.port || 3306, data.user, data.password, data.database || '', data.ssl ? 1 : 0);
  return result.lastInsertRowid;
}

function getUserConnections(userId) {
  return db.prepare('SELECT * FROM connections WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function getConnectionById(userId, connId) {
  return db.prepare('SELECT * FROM connections WHERE id = ? AND user_id = ?').get(connId, userId);
}

function updateConnection(userId, connId, data) {
  db.prepare(
    'UPDATE connections SET name = ?, host = ?, port = ?, username = ?, password = ?, database_name = ?, ssl = ? WHERE id = ? AND user_id = ?'
  ).run(data.name, data.host, data.port || 3306, data.user, data.password, data.database || '', data.ssl ? 1 : 0, connId, userId);
}

function deleteConnection(userId, connId) {
  db.prepare('DELETE FROM connections WHERE id = ? AND user_id = ?').run(connId, userId);
}

function saveQuery(userId, name, queryText) {
  const stmt = db.prepare('INSERT INTO saved_queries (user_id, name, query_text) VALUES (?, ?, ?)');
  return stmt.run(userId, name, queryText);
}

function getSavedQueries(userId) {
  return db.prepare('SELECT * FROM saved_queries WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}

function deleteSavedQuery(userId, queryId) {
  db.prepare('DELETE FROM saved_queries WHERE id = ? AND user_id = ?').run(queryId, userId);
}

module.exports = {
  getUserCount, createUser, getUser, getUserById, verifyPassword,
  addConnection, getUserConnections, getConnectionById, updateConnection, deleteConnection,
  saveQuery, getSavedQueries, deleteSavedQuery
};
