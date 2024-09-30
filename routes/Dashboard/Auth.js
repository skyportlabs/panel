/**
 * @fileoverview This module sets up the authentication routes using Passport for user
 * authentication with a local strategy. It handles user login, logout, and registration processes.
 * User credentials are verified against a custom database handler, and sessions are managed
 * through Passport's session handling.
 */

const express = require('express');
const passport = require('passport');
const log = new (require('cat-loggr'))();
const LocalStrategy = require('passport-local').Strategy;
const { v4: uuidv4 } = require('uuid');
const { db } = require('../../handlers/db.js');
const { sendWelcomeEmail, sendPasswordResetEmail, sendVerificationEmail } = require('../../handlers/email.js');
const speakeasy = require('speakeasy');
const bcrypt = require('bcrypt');
const saltRounds = 10;

const router = express.Router();

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
      const settings = await db.get('settings') || {};
      const users = await db.get('users');
      if (!users) {
        return done(null, false, { message: 'No users found.' });
      }

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

      if (!user.verified && (settings.emailVerification || false)) {
        return done(null, false, { message: 'Email not verified. Please verify your email.', userNotVerified: true });
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
  const settings = await db.get('settings') || {};
  const emailVerificationEnabled = settings.emailVerification || false;

  if (emailVerificationEnabled) {
    return addUserToUsersTable(username, email, password, false);
  } else {
    return addUserToUsersTable(username, email, password, true);
  }
}

async function addUserToUsersTable(username, email, password, verified) {
  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const userId = uuidv4();
    const verificationToken = verified ? null : generateRandomCode(30);
    let users = await db.get('users') || [];
    const newUser = { userId, username, email, password: hashedPassword, accessTo: [], admin: false, welcomeEmailSent: false, verified, verificationToken };
    users.push(newUser);
    await db.set('users', users);

    if (!newUser.welcomeEmailSent) {
      await sendWelcomeEmail(email, username, password);
      newUser.welcomeEmailSent = true;

      if (!verified) {
        await sendVerificationEmail(email, verificationToken);
        users = await db.get('users') || [];
        const index = users.findIndex(u => u.userId === newUser.userId);
        if (index !== -1) {
          users[index] = newUser;
          await db.set('users', users);
        }
      }
    }

    return users;
  } catch (error) {
    log.error('Error adding user to database:', error);
    throw error;
  }
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
      throw new Error('User not found');
    }
    
    // Search for the user with the provided username in the users array
    const user = users.find(user => user.username === username);

    if (!user) {
      throw new Error('User not found');
    }

    done(null, user); // Deserialize user by retrieving full user details from the database
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
router.get('/auth/login', async (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      if (info.userNotVerified) {
        return res.redirect('/login?err=UserNotVerified');
      }
      return res.redirect('/login?err=InvalidCredentials&state=failed');
    }
    req.logIn(user, async (err) => {
      if (err) return next(err);
      
      const users = await db.get('users');
      const user2 = users.find(u => u.username === user.username);

      if (user2 && user2.twoFAEnabled) {
        req.session.tempUser = user;
        req.user = null;
        return res.redirect('/2fa');
      } else {
        return res.redirect('/instances');
      }
    });
  })(req, res, next);
});

router.post('/auth/login', passport.authenticate('local', { 
  failureRedirect: '/login?err=InvalidCredentials&state=failed' 
}), async (req, res, next) => {
  try {
    if (req.user) {
      const users = await db.get('users');
      const user = users.find(u => u.username === req.user.username);

      if (user && user.verified) {
        return res.redirect('/instances');
      }

      if (user && user.twoFAEnabled) {
        req.session.tempUser = req.user;
        req.logout(err => {
          if (err) return next(err);
        
          return res.redirect('/2fa');
        });
      } else {
        return res.redirect('/instances');
      }
    } else {
      return res.redirect('/login?err=InvalidCredentials&state=failed');
    }
  } catch (error) {
    log.error('Error during login:', error);
    return res.status(500).send('Internal Server Error');
  }
});

router.get('/2fa', async (req, res) => {
  if (!req.session.tempUser) {
    return res.redirect('/login');
  }
  res.render('auth/2fa', {
    req
  });
});

router.post('/2fa', async (req, res) => {
  const { token } = req.body;
  const tempUser = req.session.tempUser;

  if (!tempUser) {
    return res.redirect('/login');
  }

  const users = await db.get('users');
  const user = users.find(user => user.username === tempUser.username);

  const verified = speakeasy.totp.verify({
    secret: user.twoFASecret,
    encoding: 'base32',
    token
  });

  if (verified) {
    req.login(tempUser, err => {
      if (err) return next(err);
      
      req.session.tempUser = null;
      return res.redirect('/instances');
    });
  } else {
    return res.status(400).redirect('/2fa?err=InvalidAuthCode');
  }
});

router.get('/auth/login', passport.authenticate('local', {
  successRedirect: '/instances',
  failureRedirect: '/login?err=InvalidCredentials&state=failed',
}));

router.get('/verify/:token', async (req, res) => {
  const { token } = req.params;
  try {
    let users = await db.get('users') || [];
    const user = users.find(u => u.verificationToken === token);
    if (user) {
      user.verified = true;
      user.verificationToken = null;
      await db.set('users', users);
      res.redirect('/login?msg=EmailVerified');
    } else {
      res.redirect('/login?msg=InvalidVerificationToken');
    }
  } catch (error) {
    log.error('Error verifying email:', error);
    res.status(500).send('Internal server error');
  }
});

router.get('/resend-verification', async (req, res) => {
  try {
    res.render('auth/resend-verification', {
      req
    });
  } catch (error) {
    log.error('Error fetching name or logo:', error);
    res.status(500).send('Internal server error');
  }
});

router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;

  try {
    let users = await db.get('users') || [];
    const userIndex = users.findIndex(u => u.email === email);

    if (userIndex === -1) {
      res.redirect('/login?msg=UserNotFound');
      return;
    }

    const user = users[userIndex];

    if (user.verified) {
      res.redirect('/login?msg=UserAlreadyVerified');
      return;
    }
    const newVerificationToken = generateRandomCode(30);
    user.verificationToken = newVerificationToken;

    users[userIndex] = user;
    await db.set('users', users);

    await sendVerificationEmail(email, newVerificationToken);

    res.redirect('/login?msg=VerificationEmailResent');
  } catch (error) {
    log.error('Error resending verification email:', error);
    res.status(500).send('Internal server error');
  }
});

router.get('/', (req, res) => {
  if (req.user) {
    res.redirect('/instances');
  } else {
    res.redirect('/login');
  }
});

router.get('/login', async (req, res) => {
  if (!req.user) {
    res.render('auth/login', {
      req,
      user: req.user
    });
  } else {
    res.redirect('/instances');
  }
});

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
              if (!req.user) {
                res.render('auth/register', {
                  req,
                  user: req.user
                });
              } else {
                res.redirect('/instances');
              }
            } catch (error) {
              log.error('Error fetching name or logo:', error);
              res.status(500).send('Internal server error');
            }
          });

          router.post('/auth/register', async (req, res) => {
            const { username, email, password } = req.body;
          
            try {
              const userExists = await doesUserExist(username);
              const emailExists = await doesEmailExist(email);
          
              if (userExists || emailExists) {
                res.send('User already exists');
                return;
              }
          
              const settings = await db.get('settings') || {};
              const emailVerificationEnabled = settings.emailVerification || false;
          
              if (emailVerificationEnabled) {
                await createUser(username, email, password);
                res.redirect('/login?msg=AccountcreateEmailSent');
              } else {
                await addUserToUsersTable(username, email, password, true); 
                res.redirect('/login?msg=AccountCreated');
              }
            } catch (error) {
              log.error('Error handling registration:', error);
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
      log.error('Error initializing routes:', error);
    }
  }
  await updateRoutes();
  setInterval(updateRoutes, 1000);
}

initializeRoutes();

router.get('/auth/reset-password', async (req, res) => {
  try {
    res.render('auth/reset-password', {
      req
    });
  } catch (error) {
    log.error('Error rendering reset password page:', error);
    res.status(500).send('Internal server error');
  }
});

router.post('/auth/reset-password', async (req, res) => {
  const { email } = req.body;

  try {
    const users = await db.get('users') || [];
    const user = users.find(u => u.email === email);

    if (!user) {
      res.redirect('/auth/reset-password?err=EmailNotFound');
      return;
    }

    const resetToken = generateRandomCode(30);
    user.resetToken = resetToken;
    await db.set('users', users);

    await sendPasswordResetEmail(email, resetToken);

    res.redirect('/auth/reset-password?msg=PasswordSent');
  } catch (error) {
    log.error('Error handling password reset:', error);
    res.redirect('/auth/reset-password?msg=PasswordResetFailed');
  }
});

router.get('/auth/reset/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const users = await db.get('users') || [];
    const user = users.find(u => u.resetToken === token);

    if (!user) {
      res.send('Invalid or expired token.');
      return;
    }

    res.render('auth/password-reset-form', {
      req,
      token: token
    });
  } catch (error) {
    log.error('Error rendering password reset form:', error);
    res.status(500).send('Internal server error');
  }
});

router.post('/auth/reset/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const users = await db.get('users') || [];
    if (!users) {
      throw new Error('No users found');
    }

    const user = users.find(user => user.resetToken === token);

    if (!user) {
      res.redirect('/login?msg=PasswordReset&state=failed');
      return;
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    user.password = hashedPassword;
    delete user.resetToken;
    await db.set('users', users);

    res.redirect('/login?msg=PasswordReset&state=success');
  } catch (error) {
    log.error('Error handling password reset:', error);
    res.redirect('/login?msg=PasswordReset&state=failed');
  }
});

function generateRandomCode(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

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

initializeRoutes().catch(error => {
  log.error('Error initializing routes:', error);
});

module.exports = router;