/*
 *           __                          __ 
*      _____/ /____  ______  ____  _____/ /_
 *    / ___/ //_/ / / / __ \/ __ \/ ___/ __/
 *   (__  ) ,< / /_/ / /_/ / /_/ / /  / /_  
 *  /____/_/|_|\__, / .___/\____/_/   \__/  
 *           /____/_/                  
 *              
 *  Skyport Panel v1 (Firestorm Peak)
 *  (c) 2024 Matt James and contributers
 * 
*/

/**
 * @fileoverview Main server file for Skyport Panel. Sets up the express application,
 * configures middleware for sessions, body parsing, and websocket enhancements, and dynamically loads route
 * modules. This file also sets up the server to listen on a configured port and initializes logging.
 */

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');
const CatLoggr = require('cat-loggr');
const fs = require('node:fs');
const config = require('./config.json')
const ascii = fs.readFileSync('./handlers/ascii.txt', 'utf8');
const app = express();
const chalk = require('chalk');
const expressWs = require('express-ws')(app);

const { init } = require('./handlers/init.js');

const log = new CatLoggr();

/**
 * Initializes the Express application with necessary middleware for parsing HTTP request bodies,
 * handling sessions, and integrating WebSocket functionalities. It sets EJS as the view engine,
 * reads route files from the 'routes' directory, and applies WebSocket enhancements to each route.
 * Finally, it sets up static file serving and starts listening on a specified port.
 */
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.set('view engine', 'ejs');
app.use(session({
    secret: 'secret',
    resave: true,
    saveUninitialized: true
}));

app.use(passport.initialize());
app.use(passport.session());

// init
init();

// Log the ASCII
console.log(chalk.gray(ascii) + chalk.white(`version v${config.version}\n`));

/**
 * Dynamically loads all route modules from the 'routes' directory, applying WebSocket support to each.
 * Logs the loaded routes and mounts them to the Express application under the root path. This allows for
 * modular route definitions that can be independently maintained and easily scaled.
 */
let routes = fs.readdirSync("./routes");
routes.forEach(routeFile => {
  const route = require(`./routes/${routeFile}`);
  log.init('loaded route: ' + routeFile)
  expressWs.applyTo(route)
  app.use("/", route);
});

/**
 * Configures the Express application to serve static files from the 'public' directory, providing
 * access to client-side resources like images, JavaScript files, and CSS stylesheets without additional
 * routing. The server then starts listening on a port defined in the configuration file, logging the port
 * number to indicate successful startup.
 */
app.use(express.static('public'));
app.listen(config.port, () => log.info(`skyport is listening on port ${config.port}`));
