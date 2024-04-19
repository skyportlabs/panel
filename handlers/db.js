const Keyv = require('keyv');
const db = new Keyv('sqlite://skyport.db');

module.exports = { db }