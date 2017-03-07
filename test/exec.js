'use strict';

const { Connection } = require('../lib/service/connection');

const con = new Connection({
  user: process.argv[2],
  password: process.argv[3]
});

