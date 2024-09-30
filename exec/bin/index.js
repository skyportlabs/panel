#!/usr/bin/env node

const { Command } = require('commander');

const program = new Command();

program
    .version("0.1.0-beta6")
    .description("Command Line Interface for the Skyport Panel");

program
    .command('seed')
    .description('Seeds the images to the database')
    .action(async () => {
        const axios = require('axios');
        const { db } = require('../../handlers/db');
        const log = new (require('cat-loggr'))();
        const readline = require('readline');
        const { v4: uuidv4 } = require('uuid');

        const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
        });

        async function seed() {
        try {
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

        async function performSeeding() {
        try {
            const imagesIndexResponse = await axios.get('https://raw.githubusercontent.com/skyportlabs/images_v2/main/seed/0.1.0-beta2.json');
            const imageUrls = imagesIndexResponse.data;
            let imageDataArray = [];

            for (let url of imageUrls) {
            log.init('fetching image data...' + url);
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

    });

program
    .command('createUser')
    .description('Creates a new Admin user')
    .action(async () => {
        const readline = require('readline');
        const { db } = require('../../handlers/db.js');
        const { v4: uuidv4 } = require('uuid');
        const bcrypt = require('bcrypt');
        const log = new (require('cat-loggr'))();
        const saltRounds = process.env.SALT_ROUNDS || 10;
        
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        async function doesUserExist(username) {
            const users = await db.get('users');
            if (users) {
                return users.some(user => user.username === username);
            } else {
                return false;
            }
        }
        
        async function doesEmailExist(email) {
            const users = await db.get('users');
            if (users) {
                return users.some(user => user.email === email);
            } else {
                return false;
            }
        }
        
        async function initializeUsersTable(username, email, password) {
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            const userId = uuidv4();
            const users = [{ userId, username, email, password: hashedPassword, accessTo: [], admin: true }];
            return db.set('users', users);
        }
        
        async function addUserToUsersTable(username, email, password) {
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            const userId = uuidv4();
            const users = await db.get('users') || [];
            users.push({ userId, username, email, password: hashedPassword, accessTo: [], admin: true });
            return db.set('users', users);
        }
        
        async function createUser(username, email, password) {
            const users = await db.get('users');
            if (!users) {
                return initializeUsersTable(username, email, password);
            } else {
                return addUserToUsersTable(username, email, password);
            }
        }
        
        function askQuestion(question) {
            return new Promise((resolve) => {
                rl.question(question, (answer) => {
                    resolve(answer);
                });
            });
        }
        
        function isValidEmail(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        }
        
        async function main() {
            log.init('create a new *admin* user for the skyport panel:')
            log.init('you can make regular users from the admin -> users page!')
            const username = await askQuestion("username: ");
            const email = await askQuestion("email: ");
        
            if (!isValidEmail(email)) {
                log.error("invalid email!");
                rl.close();
                return;
            }
        
            const password = await askQuestion("password: ");
        
            const userExists = await doesUserExist(username);
            const emailExists = await doesEmailExist(email);
            if (userExists || emailExists) {
                log.error("user already exists!");
                rl.close();
                return;
            }
        
            await createUser(username, email, password);
            log.info("done! user created.");
            rl.close();
        }
        
        main();        
    });

program.parse(process.argv);
