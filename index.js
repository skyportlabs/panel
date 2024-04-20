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

const log = new CatLoggr();

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

// Initialize skyportd
console.log(chalk.gray(ascii) + chalk.white(`version v${config.version}\n`));

// Set up routes
let routes = fs.readdirSync("./routes");
routes.forEach(routeFile => {
  const route = require(`./routes/${routeFile}`);
  log.init('loaded route: ' + routeFile)
  expressWs.applyTo(route)
  app.use("/", route);
});

app.use(express.static('public'));
app.listen(config.port, () => log.info(`skyport is listening on port ${config.port}`));
