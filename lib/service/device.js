'use srict';

const EventEmitter = require('events');

class Command {
  constructor(name) {
    this.type = 1;
    this.name = name;
    this.parameters = [];
  }
}

class Device extends EventEmitter {

  constructor(config, connection) {
    super();
    this.configUrl   = config.url;
    this.configLabel = config.label;
    this.definition  = null;
    this.deviceURL   = null;
    this.states      = new Map();
    this.connection  = connection;
    this.connection.on('devicesRefresh', () => this.reload());
    this.connection.on('stateChanged', (url, states) => this.stateChanged(url, states));
    this.reload();
  }

  reload() {
    const devices = this.connection.devices;
    this.definition = null;
    this.deviceURL = null;

    let device;
    if(this.configUrl) {
      device = devices.find(dev => dev.deviceURL === this.configUrl);
    } else if(this.configLabel) {
      device = devices.find(dev => dev.label === this.configLabel);
    }

    if(!device) {
      return;
    }

    this.deviceURL = device.deviceURL;
    this.definition = device.definition;
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

  execute(name, args, executionCallback, done) {
    if(!this.deviceURL) {
      return done(new Error('Not initialized'));
    }

    const cmd = new Command(name);
    if(args) {
      cmd.push.apply(cmd, args);
    }

    this.connection.executeCommand(this.deviceURL, cmd, executionCallback || (() => {}), done);
  }
};

module.exports = Device;