const mysql = require('mysql2/promise');
const store = require('./store');

const pools = {};

function getPoolConfig(config) {
  const poolConfig = {
    host: config.host,
    port: config.port || 3306,
    user: config.username || config.user,
    password: config.password,
    database: config.database_name || config.database || undefined,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true,
    dateStrings: true
  };

  if (config.ssl === true || config.ssl === 1) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  return poolConfig;
}

async function tryConnect(config, useSSL) {
  const connConfig = {
    host: config.host,
    port: config.port || 3306,
    user: config.username || config.user,
    password: config.password,
    database: config.database_name || config.database || undefined,
    connectTimeout: 10000
  };
  if (useSSL) {
    connConfig.ssl = { rejectUnauthorized: false };
  }
  const conn = await mysql.createConnection(connConfig);
  await conn.ping();
  await conn.end();
}

function getPool(userId, connId) {
  const key = `${userId}:${connId}`;
  if (pools[key]) return pools[key];

  const conn = store.getConnectionById(userId, connId);
  if (!conn) return null;

  const pool = mysql.createPool(getPoolConfig(conn));
  pools[key] = pool;
  return pool;
}

function removePool(userId, connId) {
  const key = `${userId}:${connId}`;
  if (pools[key]) {
    pools[key].end().catch(() => {});
    delete pools[key];
  }
}

function removeAllUserPools(userId) {
  Object.keys(pools).forEach(key => {
    if (key.startsWith(`${userId}:`)) {
      pools[key].end().catch(() => {});
      delete pools[key];
    }
  });
}

async function testConnection(config) {
  const sslMode = config.ssl === true || config.ssl === 'true' || config.ssl === 1;

  if (sslMode) {
    try {
      await tryConnect(config, true);
      return { success: true, ssl: true };
    } catch (err) {
      if (err.code === 'HANDSHAKE_NO_SSL_SUPPORT') {
        try {
          await tryConnect(config, false);
          return { success: true, ssl: false, note: 'Server does not support SSL. Connected without encryption.' };
        } catch (err2) {
          throw err2;
        }
      }
      throw err;
    }
  } else {
    try {
      await tryConnect(config, false);
      return { success: true, ssl: false };
    } catch (err) {
      if (err.message && err.message.includes('insecure transport')) {
        try {
          await tryConnect(config, true);
          return { success: true, ssl: true, note: 'Server requires SSL. Connected with encryption.' };
        } catch (err2) {
          throw err2;
        }
      }
      throw err;
    }
  }
}

module.exports = { getPool, removePool, removeAllUserPools, testConnection };
