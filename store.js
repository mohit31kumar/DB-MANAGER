const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const INTERNAL_DB_HOST = process.env.INTERNAL_DB_HOST || 'localhost';
const INTERNAL_DB_PORT = parseInt(process.env.INTERNAL_DB_PORT || '3306', 10);
const INTERNAL_DB_USER = process.env.INTERNAL_DB_USER || 'root';
const INTERNAL_DB_PASSWORD = process.env.INTERNAL_DB_PASSWORD || '';
const INTERNAL_DB_NAME = process.env.INTERNAL_DB_NAME || 'db_manager';

const pool = mysql.createPool({
  host: INTERNAL_DB_HOST,
  port: INTERNAL_DB_PORT,
  user: INTERNAL_DB_USER,
  password: INTERNAL_DB_PASSWORD,
  database: INTERNAL_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
  connectTimeout: 10000
});

const USERS_DB_PATH = path.join(__dirname, 'users.db');

async function testInternalConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    return true;
  } finally {
    conn.release();
  }
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS connections (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      host VARCHAR(255) NOT NULL,
      port INT DEFAULT 3306,
      username VARCHAR(255) NOT NULL,
      password TEXT NOT NULL,
      database_name VARCHAR(255) DEFAULT '',
      \`ssl\` TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_queries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      query_text LONGTEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function migrateFromSqliteIfNeeded() {
  if (!fs.existsSync(USERS_DB_PATH)) {
    return;
  }

  const [userCountRows] = await pool.query('SELECT COUNT(*) as count FROM users');
  const userCount = userCountRows[0]?.count ?? 0;
  if (userCount > 0) {
    return;
  }

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (err) {
    console.warn('Skipping SQLite migration: better-sqlite3 is not installed.');
    return;
  }

  const sqliteDb = new Database(USERS_DB_PATH);
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');

  const users = sqliteDb.prepare('SELECT id, username, password_hash, created_at FROM users').all();
  const connections = sqliteDb.prepare('SELECT * FROM connections').all();
  const savedQueries = sqliteDb.prepare('SELECT * FROM saved_queries').all();

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const userMap = new Map();
    for (const user of users) {
      const [result] = await connection.execute(
        'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
        [user.username, user.password_hash, user.created_at]
      );
      userMap.set(user.id, result.insertId);
    }

    for (const conn of connections) {
      await connection.execute(
        'INSERT INTO connections (user_id, name, host, port, username, password, database_name, `ssl`, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          userMap.get(conn.user_id) || conn.user_id,
          conn.name,
          conn.host,
          conn.port || 3306,
          conn.username,
          conn.password,
          conn.database_name || '',
          conn.ssl ? 1 : 0,
          conn.created_at
        ]
      );
    }

    for (const query of savedQueries) {
      await connection.execute(
        'INSERT INTO saved_queries (user_id, name, query_text, created_at) VALUES (?, ?, ?, ?)',
        [userMap.get(query.user_id) || query.user_id, query.name, query.query_text, query.created_at]
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
    sqliteDb.close();
  }
}

async function initialize() {
  await ensureSchema();
  await migrateFromSqliteIfNeeded();
}

function getUserCount() {
  return pool.query('SELECT COUNT(*) as count FROM users').then(([rows]) => rows[0].count);
}

function createUser(username, password) {
  const hash = bcrypt.hashSync(password, 10);
  return pool.query('INSERT INTO users (username, password_hash) VALUES (?, ?)', [username, hash]).then(([result]) => result.insertId);
}

function getUser(username) {
  return pool.query('SELECT * FROM users WHERE username = ?', [username]).then(([rows]) => rows[0] || null);
}

function getUserById(id) {
  return pool.query('SELECT id, username, created_at FROM users WHERE id = ?', [id]).then(([rows]) => rows[0] || null);
}

function verifyPassword(plainPassword, hash) {
  return bcrypt.compareSync(plainPassword, hash);
}

function addConnection(userId, data) {
  return pool.query(
    'INSERT INTO connections (user_id, name, host, port, username, password, database_name, `ssl`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [userId, data.name, data.host, data.port || 3306, data.user, data.password, data.database || '', data.ssl ? 1 : 0]
  ).then(([result]) => result.insertId);
}

function getUserConnections(userId) {
  return pool.query('SELECT * FROM connections WHERE user_id = ? ORDER BY created_at DESC', [userId]).then(([rows]) => rows);
}

function getConnectionById(userId, connId) {
  return pool.query('SELECT * FROM connections WHERE id = ? AND user_id = ?', [connId, userId]).then(([rows]) => rows[0] || null);
}

function updateConnection(userId, connId, data) {
  return pool.query(
    'UPDATE connections SET name = ?, host = ?, port = ?, username = ?, password = ?, database_name = ?, `ssl` = ? WHERE id = ? AND user_id = ?',
    [data.name, data.host, data.port || 3306, data.user, data.password, data.database || '', data.ssl ? 1 : 0, connId, userId]
  );
}

function deleteConnection(userId, connId) {
  return pool.query('DELETE FROM connections WHERE id = ? AND user_id = ?', [connId, userId]);
}

function saveQuery(userId, name, queryText) {
  return pool.query('INSERT INTO saved_queries (user_id, name, query_text) VALUES (?, ?, ?)', [userId, name, queryText]);
}

function getSavedQueries(userId) {
  return pool.query('SELECT * FROM saved_queries WHERE user_id = ? ORDER BY created_at DESC', [userId]).then(([rows]) => rows);
}

function deleteSavedQuery(userId, queryId) {
  return pool.query('DELETE FROM saved_queries WHERE id = ? AND user_id = ?', [queryId, userId]);
}

module.exports = {
  initialize,
  testInternalConnection,
  getUserCount, createUser, getUser, getUserById, verifyPassword,
  addConnection, getUserConnections, getConnectionById, updateConnection, deleteConnection,
  saveQuery, getSavedQueries, deleteSavedQuery
};
