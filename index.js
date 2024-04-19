const express = require('express');
const session = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');
const fs = require('node:fs');
const app = express();

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

// Ensure your routes are set up here after passport initialization
let routes = fs.readdirSync("./routes");
routes.forEach(routeFile => {
  const route = require(`./routes/${routeFile}`);
  app.use("/", route);
});

app.use(express.static('public'));
app.listen(3001, () => console.log(`Server running on port 3001`));
