'use strict';

const EventEmitter = require('events');
const log4js       = require('log4js');
const logger       = log4js.getLogger('core-plugins-hw-tahoma.Repository');

class Repository extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100); // each device adds listener

    this.connections = new Map();
  }

  add(key, connection) {
    this.connections.set(key, connection);
    logger.debug('Added connection: ' + key);
    this.emit('changed', { type: 'add', key} );
  }

  remove(key) {
    this.connections.delete(key);
    logger.debug('Removed connection: ' + key);
    this.emit('changed', { type: 'remove', key} );
  }

  get(key) {
    return this.connections.get(key);
  }
}

module.exports = new Repository();