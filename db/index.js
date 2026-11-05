'use strict';

const store = require('../store');
const MySqlAdapter = require('./mysql-adapter');
const PostgresAdapter = require('./postgres-adapter');

const adapters = {};

function adapterFor(conn) {
  return (conn && conn.db_type === 'postgres') ? PostgresAdapter : MySqlAdapter;
}

async function getAdapter(userId, connId) {
  const key = `${userId}:${connId}`;
  const existing = adapters[key];
  if (existing && !existing.closed) return existing;

  if (existing) {
    await existing.close().catch(() => {});
    delete adapters[key];
  }

  const conn = await store.getConnectionById(userId, connId);
  if (!conn) return null;

  const Adapter = adapterFor(conn);
  const adapter = new Adapter(conn);
  adapters[key] = adapter;
  return adapter;
}

async function removePool(userId, connId) {
  const key = `${userId}:${connId}`;
  const adapter = adapters[key];
  if (adapter) {
    await adapter.close().catch(() => {});
    delete adapters[key];
  }
}

function removeAllUserPools(userId) {
  const prefix = `${userId}:`;
  Object.keys(adapters).forEach(key => {
    if (key.startsWith(prefix)) {
      const adapter = adapters[key];
      adapter.close().catch(() => {});
      delete adapters[key];
    }
  });
}

async function tryConnectPg(config, useSSL) {
  const { Client } = require('pg');
  const connConfig = {
    host: config.host,
    port: config.port || 5432,
    user: config.username || config.user,
    password: config.password,
    database: config.database_name || config.database || undefined,
    connectTimeoutMillis: 10000
  };
  if (useSSL) {
    connConfig.ssl = { rejectUnauthorized: false };
  }
  const client = new Client(connConfig);
  await client.connect();
  await client.end();
}

async function tryConnectMySql(config, useSSL) {
  const mysql = require('mysql2/promise');
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

async function testConnection(config) {
  const dbType = config.db_type || 'mysql';
  const sslMode = config.ssl === true || config.ssl === 1 || config.ssl === 'true';

  if (dbType === 'postgres') {
    if (sslMode) {
      try {
        await tryConnectPg(config, true);
        return { success: true, ssl: true };
      } catch (err) {
        try {
          await tryConnectPg(config, false);
          return { success: true, ssl: false, note: 'Server does not support SSL. Connected without encryption.' };
        } catch (err2) {
          throw err2;
        }
      }
    } else {
      try {
        await tryConnectPg(config, false);
        return { success: true, ssl: false };
      } catch (err) {
        if (err.message && (err.message.includes('SSL') || err.message.includes('ssl'))) {
          try {
            await tryConnectPg(config, true);
            return { success: true, ssl: true, note: 'Server requires SSL. Connected with encryption.' };
          } catch (err2) {
            throw err2;
          }
        }
        throw err;
      }
    }
  } else {
    if (sslMode) {
      try {
        await tryConnectMySql(config, true);
        return { success: true, ssl: true };
      } catch (err) {
        if (err.code === 'HANDSHAKE_NO_SSL_SUPPORT') {
          try {
            await tryConnectMySql(config, false);
            return { success: true, ssl: false, note: 'Server does not support SSL. Connected without encryption.' };
          } catch (err2) {
            throw err2;
          }
        }
        throw err;
      }
    } else {
      try {
        await tryConnectMySql(config, false);
        return { success: true, ssl: false };
      } catch (err) {
        if (err.message && err.message.includes('insecure transport')) {
          try {
            await tryConnectMySql(config, true);
            return { success: true, ssl: true, note: 'Server requires SSL. Connected with encryption.' };
          } catch (err2) {
            throw err2;
          }
        }
        throw err;
      }
    }
  }
}

module.exports = { getAdapter, removePool, removeAllUserPools, testConnection };
