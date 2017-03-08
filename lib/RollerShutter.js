'use strict';

const log4js = require('log4js');
const logger = log4js.getLogger('core-plugins-hw-tahoma.RollerShutter');
const { Device, repository } = require('./service');

module.exports = class RollerShutter {
  constructor(config) {
    // TODO
  }

  close(done) {
    // TODO
    setImmediate(done);
  }

  static metadata(builder) {
    const binary = builder.enum('off', 'on');
    const percent = builder.range(0, 100);

    builder.usage.driver();

    builder.attribute('online', binary);
    builder.attribute('open', binary);
    builder.attribute('closure', percent);

    builder.action('open', binary);
    builder.action('close', binary);
    builder.action('toggle', binary);
    builder.action('setClosure', percent);

    builder.config('boxKey', 'string');
    builder.config('label', 'string');
    builder.config('url', 'string');
  }
};
