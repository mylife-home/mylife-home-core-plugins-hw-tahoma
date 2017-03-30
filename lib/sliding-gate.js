'use strict';

const log4js = require('log4js');
const logger = log4js.getLogger('core-plugins-hw-tahoma.SlidingGate');
const { Device, States, repository } = require('./service');

module.exports = class SlidingGate {
  constructor(config) {
    this._config = { url: config.url, label: config.label };
    this._key    = config.boxKey;
    this._device = null;
    this.online  = 'off';
    this.exec    = 'off';

    this._deviceOnlineCallback      = (value) => (this.online = value ? 'on' : 'off');
    this._deviceExecutingCallback   = (value) => (this.exec = value ? 'on' : 'off');
    this._deviceStateCallback       = () => this._stateChanged();
    this._repositoryChangedCallback = (evt) => {
      if(evt.key !== this._key) { return; }
      this._refreshDevice();
    }

    repository.on('changed', this._repositoryChangedCallback);

    this._refreshDevice();
  }

  close(done) {
    this._deleteDevice(true);
    repository.removeListener('changed', this._repositoryChangedCallback);
    setImmediate(done);
  }

  _deleteDevice(closing = false) {

    if(!closing) {
      this.online  = 'off';
      this.open    = 'on';
      this.closure = 0;
    }

    if(!this._device) { return; }

    this._device.removeListener('onlineChanged', this._deviceOnlineCallback);
    this._device.removeListener('executingChanged', this._deviceExecutingCallback);
    this._device = null;
  }

  _refreshDevice() {
    const connection = repository.get(this._key);
    if(!connection) {
      this._deleteDevice();
      return;
    }

    if(this._device) { return; }

    this._device = new Device(this._config, connection);
    this._device.on('onlineChanged', this._deviceOnlineCallback);
    this._device.on('executingChanged', this._deviceExecutingCallback);

    this._deviceOnlineCallback(this._device.online);
    this._deviceExecutingCallback(this._device.executing);
  }

  doOpen(arg) {
    if(this.online === 'off') { return; }
    if(arg === 'off') { return; }

    this._device.execute('open', [], (err) => err && logger.error(err));
  }

  doClose(arg) {
    if(this.online === 'off') { return; }
    if(arg === 'off') { return; }

    this._device.execute('close', [], (err) => err && logger.error(err));
  }

  static metadata(builder) {
    const binary = builder.enum('off', 'on');

    builder.usage.driver();

    builder.attribute('online', binary);
    builder.attribute('exec', binary);

    builder.action('doOpen', binary);
    builder.action('doClose', binary);

    builder.config('boxKey', 'string');
    builder.config('label', 'string');
    builder.config('url', 'string');
  }
};
