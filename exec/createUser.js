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

// 7gv.png
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
    const users = [{ userId, username, email, password: hashedPassword, accessTo: [], admin: true, verified: true }];
    return db.set('users', users);
}

async function addUserToUsersTable(username, email, password) {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();
    const users = await db.get('users') || [];
    users.push({ userId, username, email, password: hashedPassword, accessTo: [], admin: true, verified: true });
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
    while (true) {
        log.init('Create a new *admin* user for the Skyport Panel:');
        log.init('You can make regular users from the admin -> users page.');
        
        const username = await askQuestion("Username: ");
        const email = await askQuestion("Email: ");

        if (!isValidEmail(email)) {
            log.error("Invalid email!");
            continue;
        }

        const password = await askQuestion("Password: ");

        const userExists = await doesUserExist(username);
        const emailExists = await doesEmailExist(email);
        if (userExists || emailExists) {
            log.error("User already exists!");
            continue;
        }

        try {
            await createUser(username, email, password);
            log.info("Done! User created.");
            rl.close();
            break;
        } catch (err) {
            log.error('Error creating user:', err);
        }
    }
}

main().catch(err => {
    console.error('Unexpected error:', err);
    rl.close();
});