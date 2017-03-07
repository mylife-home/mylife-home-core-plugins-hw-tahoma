'use strict';

// https://github.com/dubocr/homebridge-tahoma/blob/master/overkiz-api.js

const EventEmitter   = require('events');
const request        = require('request');
const pollingToEvent = require('polling-to-event');
const log4js         = require('log4js');
const logger         = log4js.getLogger('core-plugins-hw-tahoma.Connection');

class Command {
  constructor(name) {
    this.type = 1;
    this.name = name;
    this.parameters = [];
  }
}

class Execution {
  constructor(name, deviceURL, command) {
    this.label = name;
    this.metadata = null;
    this.actions = [{
      deviceURL: deviceURL,
      commands: [command]
    }];
  }
}

class Connection extends EventEmitter {

  constructor(config) {
    super();
    this.eventPeriod   = config.eventPeriod || 2;
    this.refreshPeriod = config.refreshPeriod || (60 * 10);
    this.user          = config.user;
    this.password      = config.password;

    this.jar = request.jar();
    this.listenerId = null;
    this.logged = false;
    this.executionCallbacks = {};

    this.eventPoll = pollingToEvent((done) => this.doEvent(done), { longpolling: true, interval: 1000 * this.eventPeriod });
    this.eventPoll.on('error', () => (this.listenerId = null));
    this.eventPoll.on('longpoll', (data) => this.pollEvent(data));

    this.refreshPoll = pollingToEvent((done) => this.doRefresh(done), { longpolling: true, interval: 1000 * this.refreshPeriod });
    this.refreshPoll.on('error', (error) => logger.error('refresh poll error: ' + error));
  }

  doEvent(done) {
    if (!this.listenerId) { return done(null, []); }
    return this.post({
      url: this.urlForQuery(`/events/${this.listenerId}/fetch`),
      json: true
    }, done);
  }

  doRefresh(done) {
    this.refreshStates((error, data) => {
      setTimeout(() => {
        this.getDevices((error, data) => {
          if(error) {
            return logger.error('get devices error: ' + error);
          }
          for(const device of data) {
            this.emit('stateChanged', device.deviceURL, device.states);
          }
        });
      }, 10 * 1000); // Read devices states after 10s
      return done(error, data);
    });
  }

  pollEvent(data) {
    for(const event of data) {

      switch(event.name) {

        case 'DeviceStateChangedEvent': {
          this.emit('stateChanged', event.deviceURL, event.deviceStates);
          break;
        }

        case 'ExecutionStateChangedEvent': {
          const cb = this.executionCallbacks[event.execId];
          if (!cb) { break; }

          cb(event.newState, event.failureType);

          if (event.timeToNextState == -1) {
            // No more state expected for this execution
            delete this.executionCallbacks[event.execId];
            if(!Object.keys(this.executionCallbacks).length) {
              // Unregister listener when no more execution running
              this.unregisterListener();
            }
          }
          break;
        }

      }
    }
  }

  urlForQuery(query) {
    return `https://tahomalink.com/enduser-mobile-web/enduserAPI${query}`;
  }

  requestWithLogin(method, options, done) {
    options.jar = this.jar;

    const authCallback = (err, response, json) => {
      if (response && response.statusCode === 401) { // Reauthenticated
        this.logged = false;
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
        this.logged = true;
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
      url: that.urlForQuery('/events/register'),
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
      url: that.urlForQuery('/events/' + this.listenerId + '/unregister'),
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

  executeCommand(deviceURL, command, executionCallback, done) {
    const execution = new Execution('Homekit command', deviceURL, command);
    return this.post({
      url: that.urlForQuery('/exec/apply'),
      body: execution,
      json: true
    }, (err, json) => {
      if(err) { return done(err); }

      this.executionCallbacks[json.execId] = executionCallback;
      this.registerListener();

      return done(null, json); // Init OK
    });
  }
}

exports.Connection = Connection;
