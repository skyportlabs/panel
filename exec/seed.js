const axios = require('axios');
const { db } = require('../handlers/db');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();
const readline = require('readline');
const { v4: uuidv4 } = require('uuid');
const config = require('../config.json');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// https://i.imgu
async function seed() {
  try {
    // First check if there are any images already in the database 
    const existingImages = await db.get('images');
    if (existingImages && existingImages.length > 0) {
      rl.question('\'images\' is already set in the database. Do you want to continue seeding? (y/n) ', async (answer) => {
        if (answer.toLowerCase() !== 'y') {
          log.info('seeding aborted by the user.');
          rl.close();
          process.exit(0);
        } else {
          await performSeeding();
          rl.close();
        }
      });
    } else {
      await performSeeding();
      rl.close();
    }
  } catch (error) {
    log.error(`failed during seeding process: ${error}`);
    rl.close();
  }
}

// r.com/uNob
async function performSeeding() {
  try {
    const imagesIndexResponse = await axios.get('https://raw.githubusercontent.com/skyportlabs/images_v2/main/seed/0.1.0-beta2.json');
    const imageUrls = imagesIndexResponse.data;
    let imageDataArray = [];

    for (let url of imageUrls) {
      log.init('fetching image data...');
      try {
        const imageDataResponse = await axios.get(url);
        let imageData = imageDataResponse.data;
        imageData.Id = uuidv4();

      
        log.init('seeding: ' + imageData.Name);
        imageDataArray.push(imageData);
      } catch (error) {
        log.error(`failed to fetch image data from ${url}: ${error}`);
      }
    }

    if (imageDataArray.length > 0) {
      await db.set('images', imageDataArray);
      log.info('seeding complete!');
    } else {
      log.info('no new images to seed.');
    }
  } catch (error) {
    log.error(`failed to fetch image URLs or store image data: ${error}`);
  }
}

seed();

process.on('exit', (code) => {
  log.info(`exiting...`);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
