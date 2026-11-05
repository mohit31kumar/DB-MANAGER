'use strict';

class DbAdapter {
  constructor(config) {
    this.config = config;
    this.closed = false;
  }

  async close() {
    this.closed = true;
  }

  async getDatabases() {
    throw new Error('getDatabases not implemented');
  }

  async getTables(db) {
    throw new Error('getTables not implemented');
  }

  async getTableStructure(db, table) {
    throw new Error('getTableStructure not implemented');
  }

  async getTableIndexes(db, table) {
    throw new Error('getTableIndexes not implemented');
  }

  async getTableCreateSQL(db, table) {
    throw new Error('getTableCreateSQL not implemented');
  }

  async getPrimaryKeys(db, table) {
    throw new Error('getPrimaryKeys not implemented');
  }

  async getTableData(db, table, options) {
    throw new Error('getTableData not implemented');
  }

  async insertRow(db, table, values) {
    throw new Error('insertRow not implemented');
  }

  async updateRow(db, table, idColumn, id, values) {
    throw new Error('updateRow not implemented');
  }

  async deleteRow(db, table, idColumn, id) {
    throw new Error('deleteRow not implemented');
  }

  async deleteMulti(db, table, idColumn, ids) {
    throw new Error('deleteMulti not implemented');
  }

  async truncate(db, table) {
    throw new Error('truncate not implemented');
  }

  async createDatabase(name, collation) {
    throw new Error('createDatabase not implemented');
  }

  async dropDatabase(name) {
    throw new Error('dropDatabase not implemented');
  }

  async renameTable(db, table, newName) {
    throw new Error('renameTable not implemented');
  }

  async dropTable(db, table) {
    throw new Error('dropTable not implemented');
  }

  async addColumn(db, table, spec) {
    throw new Error('addColumn not implemented');
  }

  async dropColumn(db, table, col) {
    throw new Error('dropColumn not implemented');
  }

  async modifyColumn(db, table, col, spec) {
    throw new Error('modifyColumn not implemented');
  }

  async changeEngine(db, table, engine) {
    throw new Error('changeEngine not implemented');
  }

  async changeCollation(db, table, collation) {
    throw new Error('changeCollation not implemented');
  }

  async runQuery(sql) {
    throw new Error('runQuery not implemented');
  }

  async exportTable(db, table, options) {
    throw new Error('exportTable not implemented');
  }

  async exportDatabase(db, options) {
    throw new Error('exportDatabase not implemented');
  }

  async getServerInfo() {
    throw new Error('getServerInfo not implemented');
  }

  async getRowById(db, table, idColumn, id) {
    throw new Error('getRowById not implemented');
  }
}

module.exports = DbAdapter;
