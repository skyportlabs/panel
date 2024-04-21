const { db } = require('../handlers/db.js');
const config = require('../config.json');
const { v4: uuidv4 } = require('uuid');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();

async function init() {
    const skyport = await db.get('skyport_instance');
    if (!skyport) {
        log.init('this is probably your first time starting skyport, welcome!');
        log.init('you can find documentation for the panel at skyport.dev');

        let imageCheck = await db.get('images');
        if (!imageCheck) {
            log.error('before starting skyport for the first time, you didn\'t run the seed command!');
            log.error('please run: npm run seed');
            log.error('if you didn\'t do it already, make a user for yourself: npm run createUser');
            process.exit();
        }

        let skyportId = uuidv4();
        let setupTime = Date.now();
        
        let info = {
            skyportId: skyportId,
            setupTime: setupTime,
            originalVersion: config.version
        }

        await db.set('skyport_instance', info)
        log.info('initialized skyport panel with id: ' + skyportId)
    }        

    log.info('init complete!')
}

module.exports = { init }