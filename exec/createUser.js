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

async function doesEmailExist(email) {
    const users = await db.get('users');
    if (users) {
        return users.some(user => user.email === email);
    } else {
        return false; // If no users found, return false
    }
}

// Function to create the users table and add the first user
async function initializeUsersTable(username, email, password) {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();
    const users = [{ userId, username, email, password: hashedPassword, "Accesto":[], admin: true, verified: true }]; 
    return db.set('users', users);
}

// Function to add a new user to the existing users table
async function addUserToUsersTable(username, email, password) {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();
    const users = await db.get('users') || [];
    users.push({ userId, username, email, password: hashedPassword, "Accesto":[], admin: true, verified: true });
    return db.set('users', users);
}

// Function to create a new user
async function createUser(username, email, password) {
    const users = await db.get('users');
    if (!users) {
        // If users table doesn't exist, initialize it with the first user
        return initializeUsersTable(username, email, password);
    } else {
        // If users table exists, add the new user to it
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
    log.init('Create a new *admin* user for the Skyport Panel:');
    log.init('You can make regular users from the admin -> users page.');
    
    const username = await askQuestion("Username: ");
    const email = await askQuestion("Email: ");

    if (!isValidEmail(email)) {
        log.error("Invalid email!");
        rl.close();
        return;
    }

    const password = await askQuestion("Password: ");

    const userExists = await doesUserExist(username);
    const emailExists = await doesEmailExist(email);
    if (userExists || emailExists) {
        log.error("User already exists!");
        rl.close();
        return;
    }

    await createUser(username, email, password);
    log.info("Done! User created.");
    rl.close();
}

main().catch(err => {
    console.error('Error creating user:', err);
    rl.close();
});
