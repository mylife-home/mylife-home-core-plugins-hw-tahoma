'use strict';

// https://github.com/dubocr/homebridge-tahoma/blob/master/overkiz-api.js

const EventEmitter   = require('events');
const request        = require('request');
const pollingToEvent = require('polling-to-event');
const async          = require('async');
const log4js         = require('log4js');
const logger         = log4js.getLogger('core-plugins-hw-tahoma.Connection');

function configInt(value, defaultValue) {
  const val = parseInt(value);
  if(val > 0) { return val; }
  return defaultValue;
}

class Connection extends EventEmitter {

  constructor(config) {
    super();
    this.eventPeriod   = configInt(config.eventPeriod, 2);
    this.refreshPeriod = configInt(config.refreshPeriod, 600);
    this.user          = config.user;
    this.password      = config.password;

    this.jar = request.jar();
    this.listenerId = null;
    this.logged = false;
    this.execToDevice = new Map();
    this.devices = [];

    this.eventPoll = pollingToEvent((done) => this.doEvent(done), { longpolling: true, interval: 1000 * this.eventPeriod });
    this.eventPoll.on('error', () => (this.listenerId = null));
    this.eventPoll.on('longpoll', (data) => this.pollEvent(data));

    this.refreshPoll = pollingToEvent((done) => this.doRefresh(done), { longpolling: true, interval: 1000 * this.refreshPeriod });
    this.refreshPoll.on('error', (error) => logger.error('refresh poll error: ' + error));

    this.execToMapCleaner = setInterval(() => this.execToMapCleanup(), 30000);
  }

  close() {
    this.eventPoll.clear();
    this.refreshPoll.clear();
    this.execToDevice.clear();
    clearInterval(this.execToMapCleaner);
  }

  execToMapCleanup() {
    const minTS = Date.now() - 1000 * 60 * 5; // 5 mins
    const keys = [];
    for(const [key, data] of this.execToDevice.entries()) {
      if(data.timestamp < minTS) {
        keys.push(key);
      }
    }

    for(const key of keys) {
      this.execToDevice.delete(key);
    }
  }

  changeLogged(value) {
    this.logged = value;
    this.emit('loggedChanged', value);

    if(value) {
      this.registerListener();
    }
  }

  doEvent(done) {
    if (!this.listenerId) { return done(null, []); }
    return this.post({
      url: this.urlForQuery(`/events/${this.listenerId}/fetch`),
      json: true
    }, done);
  }

  doRefresh(done) {
    this.refreshStates((err, data) => {
      if(err) { return done(err); }
      this.getDevices((err, data) => {
        if(err) {
          return logger.error('get devices error: ' + err);
        }

        this.devices = data;
        this.emit('devicesRefresh', this.devices);

        for(const device of data) {
          this.emit('deviceStateChanged', device.deviceURL, device.states);
        }
      });
      return done(null, data);
    });
  }

  pollEvent(data) {
    if(!data || !data.length) {return; }

    async.series(data.map(event => done => this.processEvent(event, done)), (err) => {
      err && logger.error('Error processing events: ' + err);
    });
  }

  processEvent(event, done) {
    switch(event.name) {

      case 'DeviceStateChangedEvent':
        return syncToAsync(() => this.emit('deviceStateChanged', event.deviceURL, event.deviceStates), done);

      case 'ExecutionStateChangedEvent':
      case 'CommandExecutionStateChangedEvent': {
        return this.getDeviceFromExec(event.execId, (err, deviceURL) => {
          if(err) { return done(err); }
          const lightEvent = {
            execId   : event.execId,
            newState : event.newState
          }
          return syncToAsync(() => this.emit('execStateChanged', deviceURL, lightEvent), done);
        });
      }

      case 'RefreshAllDevicesStatesCompletedEvent':
      case 'DeviceUnavailableEvent':
        // ??
        break;

      default:
        logger.debug('Unhandled event', event);
    }
  }

  getDeviceFromExec(execId, done) {
    const dev = this.execToDevice.get(execId);
    if(dev) {
      return done(null, dev.deviceURL);
    }

    return this.get({
      url: this.urlForQuery(`/exec/current/${execId}`),
      json: true
    }, (err, data) => {
      if (err) { return done(err); }
        if(!data.actionGroup) {
          return done(new Error('No such execId'));
        }
        const deviceURL = data.actionGroup.actions[0].deviceURL; // TODO: multiple actions on different devices ?
        this.execToDevice.set(execId, { deviceURL, timestamp: Date.now() });
        return done(null, deviceURL);
    });
  }

  urlForQuery(query) {
    return `https://tahomalink.com/enduser-mobile-web/enduserAPI${query}`;
  }

  requestWithLogin(method, options, done) {
    options.jar = this.jar;

    const authCallback = (err, response, json) => {
      if (response && response.statusCode === 401) { // Reauthenticated
        this.changeLogged(false);
        logger.warn('Reauthenticated error: ' + json.error);
        return this.requestWithLogin(method, options, done);
      }

      if (err) {
        logger.error('There was a problem requesting to Tahoma : ' + err);
        return done(err);
      }

      if (response && (response.statusCode < 200 || response.statusCode >= 300)) {
        let msg = 'Error ' + response.statusCode;
        if(json.error != null) {
          msg += ' ' + json.error;
        }
        if(json.errorCode != null) {
          msg += ' (' + json.errorCode + ')';
        }
        const err = new Error(msg);
        logger.error(err);
        return done(new Error(err));
      }

      return done(null, json);
    };

    if (this.logged) {
      return request[method](options, authCallback);
    }

    logger.debug('Connecting to server');

    return request.post({
      url  : this.urlForQuery('/login'),
      form : { userId : this.user, userPassword : this.password },
      json : true,
      jar  : this.jar
    }, (err, response, json) => {
      if (err) {
        return logger.warn('Unable to login: ' + err);
      }

      if (json.success) {
        this.changeLogged(true);
        return request[method](options, authCallback);
      }

      if (json.error) {
        return logger.warn('Loggin fail: ' + json.error);
      }

      logger.error('Unable to login');
    });
  }

  get(options, done) {
    this.requestWithLogin('get', options, done);
  }

  post(options, done) {
    this.requestWithLogin('post', options, done);
  }

  put(options, done) {
    this.requestWithLogin('put', options, done);
  }

  delete(options, done) {
    this.requestWithLogin('delete', options, done);
  }

  getDevices(done) {
    this.get({
      url: this.urlForQuery('/setup/devices'),
      json: true
    }, done);
  }

  registerListener() {
    if(this.listenerId) { return; }

    logger.debug('Register listener');

    return this.post({
      url: this.urlForQuery('/events/register'),
      json: true
    }, (err, data) => {
      if (err) { return logger.error('registerListener error: ' + err); }
      this.listenerId = data.id;
    });
  }

  unregisterListener() {
    if(!this.listenerId) { return; }

    logger.debug('Unregister listener');

    return this.post({
      url: this.urlForQuery('/events/' + this.listenerId + '/unregister'),
      json: true
    }, (err, data) => {
      if (err) { return logger.error('registerListener error: ' + err); }
      this.listenerId = null;
    });
  }

  refreshStates(done) {
    this.put({
      url: this.urlForQuery('/setup/devices/states/refresh'),
      json: true
    }, done);
  }

  requestState(deviceURL, state, done) {
    return this.get({
      url: this.urlForQuery(`/setup/devices/${encodeURIComponent(deviceURL)}/states/${encodeURIComponent(state)}`),
      json: true
    }, (error, data) => done(error, data && data.value));
  }

  cancelCommand(execId, done) {
    return this.delete({
      url: this.urlForQuery('/exec/current/setup/' + execId),
      json: true
    }, done);
  }

  executeCommand(deviceURL, command, done) {
    const execution = {
      label    : 'MyLife Home command',
      metadata : null,
      actions  : [{
        deviceURL,
        commands : [command]
      }]
    };

    return this.post({
      url: this.urlForQuery('/exec/apply'),
      body: execution,
      json: true
    }, (err, json) => {
      if(err) { return done(err); }

      this.execToDevice.set(json.execId, { deviceURL, timestamp: Date.now() });
      return done();
    });
  }
}

function syncToAsync(fn, done) {
  let err, ret;
  try {
    ret = fn();
  } catch(exc) {
    err = exc;
  }
  return done(err, ret);
}

module.exports = Connection;
