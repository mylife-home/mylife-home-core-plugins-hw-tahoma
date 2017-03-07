'use srict';

const EventEmitter = require('events');

const executionState = {
  INITIALIZED     : true,
  NOT_TRANSMITTED : true,
  IN_PROGRESS     : true,
  TRANSMITTED     : true,
  COMPLETED       : false,
  FAILED          : false
};

class Device extends EventEmitter {

  constructor(config, connection) {
    super();
    this.configUrl   = config.url;
    this.configLabel = config.label;
    this.definition  = null;
    this.deviceURL   = null;
    this.states      = new Map();
    this.executing   = false;
    this.online      = false;
    this.connection  = connection;
    this.connection.on('devicesRefresh', () => this.reload());
    this.connection.on('stateChanged', (url, states) => this.stateChanged(url, states));

    this.connection.on('loggedChanged', (value) => {
      if(!value) { this.deviceURL = null; }
      this.onlineChanged();
    });

    this.reload();
  }

  reload() {
    const oldUrl = this.deviceURL;
    const devices = this.connection.devices;
    this.definition = null;
    this.deviceURL = null;

    let device;
    if(this.configUrl) {
      device = devices.find(dev => dev.deviceURL === this.configUrl);
    } else if(this.configLabel) {
      device = devices.find(dev => dev.label === this.configLabel);
    }

    if(device) {
      this.deviceURL = device.deviceURL;
      this.definition = device.definition;
    }

    if(this.deviceURL !== oldUrl) {
      this.onlineChanged();
    }
  }

  onlineChanged() {
    const newValue = this.connection.logged && !!this.deviceURL;
    if(this.online === newValue) { return; }
    this.online = newValue;
    this.emit('onlineChanged');
  }

  stateChanged(url, states) {
    if(this.deviceURL !== url) {
      return;
    }

    const keys = [];
    for(const state of states) {
      const { name, value } = state;
      if(this.states.get(name) !== value) {
        this.states.set(name, value);
        keys.push(name);
      }
    }

    if(keys.length) {
      this.emit('stateChanged', keys);
    }
  }

  getState(name) {
    return this.states.get(name);
  }

  changeExecuting(value) {
    if(this.executing === value) { return; }
    this.executing = value;
    this.emit('executingChanged', value);
  }

  execute(name, args, done) {
    if(!this.deviceURL) {
      return done(new Error('Not initialized'));
    }

    const cmd = {
      name,
      type       : 1,
      parameters : args || []
    };

    const executionCallback = (state/*, failure*/) => {
      this.changeExecuting(executionState[state] || false);
    };

    this.connection.executeCommand(this.deviceURL, cmd, executionCallback, done);
  }
};

module.exports = Device;