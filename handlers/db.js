const config = require('../config.json');

if (!config.databaseURL) {
    throw new Error('Database URL not set in config.json');
}

let db;

if (config.databaseURL.startsWith('sqlite')) {
    const Keyv = require('keyv');
    db = new Keyv('sqlite://skyport.db');
} else {
    const Keyv = require('@keyvhq/core');
    const KeyvMysql = require('@keyvhq/mysql');

    const mysqlConfig = {
        url: config.databaseURL,
        table: 'skyport',
        keySize: 255,
    };

    db = new Keyv({
        store: new KeyvMysql(mysqlConfig.url, {
            table: mysqlConfig.table,
            keySize: mysqlConfig.keySize
        })
    });
}

module.exports = { db };