/**
 * @fileoverview This module sets up the authentication routes using Passport for user
 * authentication with a local strategy. It handles user login, logout, and registration processes.
 * User credentials are verified against a custom database handler, and sessions are managed
 * through Passport's session handling.
 */

const express = require('express');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { db } = require('../handlers/db.js');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const saltRounds = 10;

const router = express.Router();

// Initialize passport
router.use(passport.initialize());
router.use(passport.session());

/**
 * Configures Passport's local strategy for user authentication. It checks the provided
 * username (or email) and password against stored credentials in the database. If the credentials
 * match, the user is authenticated; otherwise, appropriate error messages are returned.
 *
 * @returns {void} No return value but configures the local authentication strategy.
 */
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const users = await db.get('users');
      if (!users) {
        return done(null, false, { message: 'No users found.' });
      }

      // Check if the input is an email
      const isEmail = username.includes('@');

      let user;
      if (isEmail) {
        user = users.find(user => user.email === username);
      } else {
        user = users.find(user => user.username === username);
      }

      if (!user) {
        return done(null, false, { message: 'Incorrect username or email.' });
      }

      const match = await bcrypt.compare(password, user.password);
      if (match) {
        return done(null, user);
      } else {
        return done(null, false, { message: 'Incorrect password.' });
      }
    } catch (error) {
      return done(error);
    }
  }
));

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

async function createUser(username, email, password) {
  return addUserToUsersTable(username, email, password);
}

async function addUserToUsersTable(username, email, password) {
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  const userId = uuidv4();
  const users = await db.get('users') || [];
  users.push({ userId, username, email, password: hashedPassword, "Accesto":[], admin: false });
  return db.set('users', users);
}

/**
 * Serializes the user to the session, storing only the username to manage login sessions.
 * @param {Object} user - The user object from the database.
 * @param {Function} done - A callback function to call with the username.
 */
passport.serializeUser((user, done) => {
  done(null, user.username);
});

/**
 * Deserializes the user from the session by retrieving the full user details from the database
 * using the stored username. Necessary for loading user details on subsequent requests after login.
 * @param {string} username - The username stored in the session.
 * @param {Function} done - A callback function to call with the user object or errors if any.
 */
passport.deserializeUser(async (username, done) => {
  try {
    const users = await db.get('users');
    if (!users) {
      throw new Error('No users found');
    }
    
    // Search for the user with the provided username in the users array
    const foundUser = users.find(user => user.username === username);

    if (!foundUser) {
      throw new Error('User not found');
    }

    done(null, foundUser); // Deserialize user by retrieving full user details from the database
  } catch (error) {
    done(error);
  }
});

/**
 * GET /auth/login
 * Authenticates a user using Passport's local strategy. If authentication is successful, the user
 * is redirected to the instances page, otherwise, they are sent back to the login page with an error.
 *
 * @returns {Response} Redirects based on the success or failure of the authentication attempt.
 */
router.get('/auth/login', passport.authenticate('local', {
  successRedirect: '/instances',
  failureRedirect: '/login?err=InvalidCredentials&state=failed',
}));

async function initializeRoutes() {
  async function updateRoutes() {
    try {
      const settings = await db.get('settings');

      if (!settings) {
        db.set('settings', { register: false });
      } else {
        if (settings.register === true) {
          router.get('/register', async (req, res) => {
            try {
              res.render('auth/register', {
                req,
                user: req.user,
                name: await db.get('name') || 'Skyport',
                logo: await db.get('logo') || false
              });
            } catch (error) {
              console.error('Error fetching name or logo:', error);
              res.status(500).send('Internal server error');
            }
          });

          router.post('/auth/register', async (req, res) => {
            const { username, email, password } = req.body;

            try {
              const users = await db.get('users');
              const userExists = await doesUserExist(username);
              const emailExists = await doesEmailExist(email);

              if (userExists || emailExists) {
                res.send('User already exists');
                return;
              }

              await createUser(username, email, password);
              res.redirect('/instances');
            } catch (error) {
              console.error('Error handling registration:', error);
              res.status(500).send('Internal server error');
            }
          });
        } else {
          router.stack = router.stack.filter(
            r => !(r.route && (r.route.path === '/register' || r.route.path === '/auth/register'))
          );
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  }
  await updateRoutes();
  setInterval(updateRoutes, 1000);
}

initializeRoutes();

/**
 * GET /auth/logout
 * Logs out the user by ending the session and then redirects the user.
 *
 * @returns {Response} No specific return value but ends the user's session and redirects.
 */
router.get("/auth/logout", (req, res) => {
  req.logout(req.user, err => {
    if (err) return next(err);
    res.redirect("/");
  });
});

module.exports = router;
