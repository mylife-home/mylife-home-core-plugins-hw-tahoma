'use strict';

const Connection = require('../lib/service/connection');
const Device = require('../lib/service/device');

const con = new Connection({
  user: process.argv[2],
  password: process.argv[3]
});

con.once('devicesRefresh', () => {
  const dev = new Device({ label : 'CH1 (bureau)'}, con);
  dev.execute('open', null, null, (err) => { console.log(err || 'done'); });
});

//con.on('logged', (value) => console.log('logged', value));
//con.on('stateChanged', (device, states) => console.log('stateChanged', device, states));

/*
volet roulant

commands: [{name: "open", parameters: []}]
commands: [{name: "setClosure", parameters: [17]}] => (17%)

states : core:ClosureState
states : core:OpenClosedState
*/