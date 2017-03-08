'use strict';

const EventEmitter = require('events');

class Repository extends EventEmitter {
  constructor() {
    super();

    this.connections = new Map();
  }

  add(key, connection) {
    this.connections.set(key, connection);
    this.emit('changed', { type: 'add', key} );
  }

  remove(key) {
    this.connections.delete(key);
    this.emit('changed', { type: 'remove', key} );
  }

  get(key) {
    return this.connections.get(key);
  }
}

module.exports = new Repository();