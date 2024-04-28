const readline = require('readline');
const { db } = require('../handlers/db.js');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();
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
        return false; // If no users found, return false
    }
}

// Function to create the users table and add the first user
async function initializeUsersTable(username, password) {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();
    const users = [{ userId, username, password: hashedPassword, admin: true }];
    return db.set('users', users);
}

// Function to add a new user to the existing users table
async function addUserToUsersTable(username, password) {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();
    const users = await db.get('users') || [];
    users.push({ userId, username, password: hashedPassword, admin: true });
    return db.set('users', users);
}

// Function to create a new user
async function createUser(username, password) {
    const users = await db.get('users');
    if (!users) {
        // If users table doesn't exist, initialize it with the first user
        return initializeUsersTable(username, password);
    } else {
        // If users table exists, add the new user to it
        return addUserToUsersTable(username, password);
    }
}

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

async function main() {
    log.init('create a new *admin* user for the skyport panel:')
    log.init('you can make regular users from the admin -> users page!')
    const username = await askQuestion("username: ");
    const password = await askQuestion("password: ");

    const userExists = await doesUserExist(username);
    if (userExists) {
        log.error("user already exists!");
        rl.close();
        return;
    }

    await createUser(username, password);
    log.info("done! user created.");
    rl.close();
}

main();