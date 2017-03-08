'use strict';

const log4js = require('log4js');
const logger = log4js.getLogger('core-plugins-hw-tahoma.RollerShutter');
const { Device, States, repository } = require('./service');

module.exports = class RollerShutter {
  constructor(config) {
    this._key    = config.boxKey;
    this._device = null;
    this.online  = 'off';
    this.open    = 'on';
    this.closure = 0;

    this._deviceOnlineCallback      = (value) => (this.online = value ? 'on' : 'off');
    this._deviceExecutinCallback    = (value) => (this.executing = value ? 'on' : 'off');
    this._deviceStateCallback       = () => this._stateChanged();
    this._repositoryChangedCallback = (evt) => {
      if(evt.key !== this._key) { return; }
      this._refreshDevice();
    }

    repository.on('changed', this._repositoryChangedCallback);

    this._refreshDevice();
  }

  close(done) {
    this._deleteDevice();
    repository.removeListener('changed', this._repositoryChangedCallback);
    setImmediate(done);
  }

  _deleteDevice() {

    this.online  = 'off';
    this.open    = 'on';
    this.closure = 0;

    if(!this._device) { return; }

    this._device.removeListener('onlineChanged', this._deviceOnlineCallback);
    this._device.removeListener('executingChanged', this._deviceExecutinCallback);
    this._device.removeListener('stateChanged', this._deviceStateCallback);
    this._device = null;
  }

  _refreshDevice() {
    const connection = repository.get(this._key);
    if(!connection) {
      this._deleteDevice();
      return;
    }

    if(this._device) { return; }

    this._device = new Device(config, connection);
    this._device.on('onlineChanged', this._deviceOnlineCallback);
    this._device.on('executingChanged', this._deviceExecutinCallback);
    this._device.on('stateChanged', this._deviceStateCallback);

    this._deviceOnlineCallback(this._device.online);
    this._deviceExecutinCallback(this._device.executing);
    this._stateChanged();
  }

  _stateChanged() {
    const closure = this._device.getState(States.STATE_CLOSURE);
    if(closure !== this.closure) {
      this.closure = closure;
    }

    const opened = this._device.getState(States.STATE_OPEN_CLOSED);
    if(opened !== this.opened) {
      this.opened = opened;
    }
  }

  static metadata(builder) {
    const binary = builder.enum('off', 'on');
    const percent = builder.range(0, 100);

    builder.usage.driver();

    builder.attribute('online', binary);
    builder.attribute('executing', binary);
    builder.attribute('opened', binary);
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
