const express = require('express');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { db } = require('../handlers/db.js');
const { v4: uuidv4 } = require('uuid');  // Import the uuid function

const router = express.Router();

// Initialize passport
router.use(passport.initialize());
router.use(passport.session());

// Configure the local strategy for Passport
passport.use(new LocalStrategy(
  async (username, password, done) => {
    try {
      const user = await db.get(username);
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      if (user.password !== password) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.username);
});

passport.deserializeUser(async (username, done) => {
  try {
    const user = await db.get(username);
    if (!user) {
      throw new Error('User not found');
    }
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// Register User
router.get('/auth/register', async (req, res) => {
  const { username, password } = req.query;
  const userId = uuidv4();  // Generate a unique user ID
  try {
      // Store the user with the newly generated ID
      await db.set(username, { userId, username, password, admin: true });
      res.redirect('/login');
  } catch (error) {
      res.redirect('/register');
  }
});

// Login Route
router.get('/auth/login', passport.authenticate('local', {
    successRedirect: '/instances',
    failureRedirect: '/login?err=InvalidCredentials&state=failed'
}));

// Logout Route
router.get('/auth/logout', (req, res) => {
    req.logout();
});

module.exports = router;