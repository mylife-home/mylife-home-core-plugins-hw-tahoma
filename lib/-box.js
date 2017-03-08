'use strict';

const log4js = require('log4js');
const logger = log4js.getLogger('core-plugins-hw-tahoma.Box');
const { Connection, repository } = require('./service');

module.exports = class Box {
  constructor(config) {

    this.online = 'off';

    this._key = config.key;
    this._connection = new Connection(config);
    this._connection.on('loggedChanged', (value) => (this.online = value ? 'on' : 'off'));

    repository.add(this._key, this._connection);
  }

  close(done) {
    repository.remove(this._key);

    this._connection.close();
    setImmediate(done);
  }

  static metadata(builder) {
    const binary = builder.enum('off', 'on');

    builder.usage.driver();

    builder.attribute('online', binary);

    builder.config('key', 'string');
    builder.config('user', 'string');
    builder.config('password', 'string');
    builder.config('eventPeriod', 'integer');
    builder.config('refreshPeriod', 'integer');
  }
};
