/*
 *           __                          __ 
*      _____/ /____  ______  ____  _____/ /_
 *    / ___/ //_/ / / / __ \/ __ \/ ___/ __/
 *   (__  ) ,< / /_/ / /_/ / /_/ / /  / /_  
 *  /____/_/|_|\__, / .___/\____/_/   \__/  
 *           /____/_/                  
 *              
 *  Skyport Panel 0.3.0 (Desiro City)
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
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const theme = require('./storage/theme.json');
const analytics = require('./utils/analytics.js');
const { isAdmin } = require('./utils/isAdmin');

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

const postRateLimiter = rateLimit({
  windowMs: 60 * 100,
  max: 6,
  message: 'Too many requests, please try again later'
});

app.use((req, res, next) => {
  if (req.method === 'POST') {
    postRateLimiter(req, res, next);
  } else {
    next();
  }
});

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
app.use(analytics);

app.use(async (req, res, next) => {
  try {
    const settings = await db.get('settings');

    res.locals.languages = getlanguages();
    res.locals.ogTitle = config.ogTitle;
    res.locals.ogDescription = config.ogDescription;
    res.locals.footer = settings.footer;
    res.locals.theme = theme;
    next();
  } catch (error) {
    console.error('Error fetching settings:', error);
    next(error);
  }
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

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Init
init();

// Log the ASCII
console.log(chalk.gray(ascii) + chalk.white(`version v${config.version}\n`));

/**
 * Dynamically loads all route modules from the 'routes' directory, applying WebSocket support to each.
 * Logs the loaded routes and mounts them to the Express application under the root path. This allows for
 * modular route definitions that can be independently maintained and easily scaled.
 */
const routesDir = path.join(__dirname, 'routes');

function getlanguages() {
  return fs.readdirSync(__dirname + '/lang').map(file => file.split('.')[0])
}

function getlangname() {
  return fs.readdirSync(path.join(__dirname, '/lang')).map(file => {
    const langFilePath = path.join(__dirname, '/lang', file);
    const langFileContent = JSON.parse(fs.readFileSync(langFilePath, 'utf-8'));
    return langFileContent.langname;
  });
}

app.get('/setLanguage', async (req, res) => {
  const lang = req.query.lang;
  if (lang && (await getlanguages()).includes(lang)) {
      res.cookie('lang', lang, { maxAge: 90000000, httpOnly: true, sameSite: 'strict' });
      req.user.lang = lang; // Update user language preference
      res.json({ success: true });
  } else {
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
      // log.init('loaded route: ' + fullPath);
      expressWs.applyTo(route);

      if (fullPath.includes(path.join('routes', 'Admin'))) {
        // Apply the isAdmin middleware only to Admin routes
        app.use("/", route);
      } else {
        app.use("/", route);
      }
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
  res.render('errors/404', {
    req,
    name: await db.get('name') || 'Skyport',
    logo: await db.get('logo') || false
  })
});
