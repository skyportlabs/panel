const readline = require('readline');
const { db } = require('../handlers/db.js');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const log = new (require('cat-loggr'))();
const saltRounds = process.env.SALT_ROUNDS || 10;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function parseArguments() {
    const args = {};
    process.argv.slice(2).forEach(arg => {
        const [key, value] = arg.split('=');
        if (key.startsWith('--')) {
            args[key.slice(2)] = value;
        }
    });
    return args;
}

async function doesUserExist(username) {
    const users = await db.get('users');
    return users ? users.some(user => user.username === username) : false;
}

async function doesEmailExist(email) {
    const users = await db.get('users');
    return users ? users.some(user => user.email === email) : false;
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
    const args = parseArguments();
    
    let username, email, password;

    if (args.username && args.email && args.password) {
        username = args.username;
        email = args.email;
        password = args.password;
    } else {
        log.init('Create a new *admin* user for the Skyport Panel:');
        log.init('You can make regular users from the admin -> users page.');
        
        username = await askQuestion("Username: ");
        email = await askQuestion("Email: ");
        
        if (!isValidEmail(email)) {
            log.error("Invalid email!");
            rl.close();
            return;
        }

        password = await askQuestion("Password: ");
    }

    const userExists = await doesUserExist(username);
    const emailExists = await doesEmailExist(email);
    if (userExists || emailExists) {
        log.error("User already exists!");
        rl.close();
        return;
    }

    try {
        await createUser(username, email, password);
        log.info("Done! User created.");
    } catch (err) {
        log.error('Error creating user:', err);
    } finally {
        rl.close();
    }
}

main().catch(err => {
    log.error('Unexpected error:', err);
    rl.close();
});
