const readline = require('readline');
const { db } = require('../handlers/db.js');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();
const saltRounds = 10;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function createUser(username, password) {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();
    return db.set(username, { userId, username, password: hashedPassword, admin: true });
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

    const userExists = await db.get(username);
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
