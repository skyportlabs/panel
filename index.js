/*
 *           __                          __ 
*      _____/ /____  ______  ____  _____/ /_
 *    / ___/ //_/ / / / __ \/ __ \/ ___/ __/
 *   (__  ) ,< / /_/ / /_/ / /_/ / /  / /_  
 *  /____/_/|_|\__, / .___/\____/_/   \__/  
 *           /____/_/                  
 *              
 *  Skyport Panel 0.2.0 (Piledriver)
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
const path = require('path');
const chalk = require('chalk');
const expressWs = require('express-ws')(app);
const { db } = require('./handlers/db.js')
const translationMiddleware = require('./handlers/translation');
const cookieParser = require('cookie-parser')

const sqlite = require("better-sqlite3");
const SqliteStore = require("better-sqlite3-session-store")(session);
const sessionstorage = new sqlite("sessions.db");

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

app.use(cookieParser())

app.use(translationMiddleware);

app.set('view engine', 'ejs');
app.use(
  session({
    store: new SqliteStore({
      client: sessionstorage,
      expired: {
        clear: true,
        intervalMs: 9000000
      }
    }),
    secret: "secret",
    resave: true,
    saveUninitialized: true
  })
);

app.use((req, res, next) => {
  res.locals.ogTitle = config.ogTitle;
  res.locals.ogDescription = config.ogDescription;
  next();
});


if (config.mode === 'production' || false) {
  

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '5');
  next();
});


app.use('/assets', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=1');
  next();
});

}

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
const routesDir = path.join(__dirname, 'routes');



app.get('/setLanguage', (req, res) => {
  const lang = req.query.lang;
  if (lang && (lang === 'en' || lang === 'de' || lang === 'nl')) {
      res.cookie('lang', lang, { maxAge: 90000000, httpOnly: true });
      req.user.lang = lang; // Update user language preference
      res.json({ success: true });
  } else {
      console.log('Invalid language');
      res.json({ success: false });
  }
});

function loadRoutes(directory) {
  fs.readdirSync(directory).forEach(file => {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      // Recursively load routes from subdirectories
      loadRoutes(fullPath);
    } else if (stat.isFile() && path.extname(file) === '.js') {
      // Only require .js files
      const route = require(fullPath);
      //log.init('loaded route: ' + fullPath);
      expressWs.applyTo(route);
      app.use("/", route);
    }
  });
}

// Start loading routes from the root routes directory
loadRoutes(routesDir);

const pluginroutes = require('./plugins/pluginmanager.js');
app.use("/", pluginroutes);

const pluginDir = path.join(__dirname, 'plugins');
const PluginViewsDir = fs.readdirSync(pluginDir).map(addonName => path.join(pluginDir, addonName, 'views'));
app.set('views', [path.join(__dirname, 'views'), ...PluginViewsDir]);

/**
 * Configures the Express application to serve static files from the 'public' directory, providing
 * access to client-side resources like images, JavaScript files, and CSS stylesheets without additional
 * routing. The server then starts listening on a port defined in the configuration file, logging the port
 * number to indicate successful startup.
 */
app.use(express.static('public'));
app.listen(config.port, () => log.info(`skyport is listening on port ${config.port}`));

app.get('*', async function(req, res){
  res.render('errors/404', { req, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false })
});