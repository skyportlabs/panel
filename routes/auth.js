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
const bcrypt = require('bcrypt');
const saltRounds = 10;

const router = express.Router();

// Initialize passport
router.use(passport.initialize());
router.use(passport.session());

/**
 * Configures Passport's local strategy for user authentication. It checks the provided
 * username and password against stored credentials in the database. If the credentials
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

      const user = users.find(user => user.username === username);
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
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

/**
 * GET /auth/logout
 * Logs out the user by ending the session and then redirects the user.
 *
 * @returns {Response} No specific return value but ends the user's session and redirects.
 */
router.get("/auth/logout", (req, res) => {
  req.logout(req.user, err => {
    if(err) return next(err);
    res.redirect("/");
  });
});

module.exports = router;