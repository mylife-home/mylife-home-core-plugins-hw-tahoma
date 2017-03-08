'use strict';

const { Connection, Device } = require('../lib/service/');

const con = new Connection({
  user: process.argv[2],
  password: process.argv[3]
});

con.once('devicesRefresh', () => {
  console.log(con.devices.map(dev => `label: '${dev.label}', url: '${dev.deviceURL}', type: '${dev.controllableName}'`).join('\n'));
  con.close();
});
