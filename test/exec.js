'use strict';

const { Connection } = require('../lib/service/connection');

const con = new Connection({
  user: process.argv[2],
  password: process.argv[3]
});

con.on('logged', (value) => console.log('logged', value));
con.on('stateChanged', (device, states) => console.log('stateChanged', device, states));
/*
con.on('logged', value => {
  if(!value) { return; }

  con.registerListener();
});
*/