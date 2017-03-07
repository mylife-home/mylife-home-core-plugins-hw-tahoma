'use strict';

const Connection = require('../lib/service/connection');
const Device = require('../lib/service/device');

const con = new Connection({
  user: process.argv[2],
  password: process.argv[3]
});

con.once('devicesRefresh', () => {
  const dev = new Device({ label : 'CH1 (bureau)'}, con);
  dev.on('onlineChanged', () => console.log('onlineChanged', dev.online));
  dev.on('stateChanged', () => console.log('stateChanged', dev.states));
  dev.on('executingChanged', () => console.log('executingChanged', dev.executing));

  dev.execute('setClosure', [40], (err) => { console.log(err || 'done'); });
});

//con.on('loggedChanged', (value) => console.log('loggedChanged', value));
//con.on('stateChanged', (device, states) => console.log('stateChanged', device, states));

/*
volet roulant

commands: [{name: "open", parameters: []}]
commands: [{name: "close", parameters: []}]
commands: [{name: "setClosure", parameters: [17]}] => (17%)

states : core:ClosureState
states : core:OpenClosedState
*/