/**
 * @fileoverview Provides authentication middleware to ensure that routes are accessible only
 * to authenticated users. This middleware leverages Passport's authentication check to determine
 * if the user's session is currently authenticated. If the user is authenticated, it allows the
 * request to proceed. Otherwise, it redirects the user to the login page.
 */

const { db } = require('./db');

/**
 * Middleware function to check if the user is authenticated. Utilizes Passport's built-in method
 * to determine if the current session is authenticated. If the session is authenticated, it calls
 * 'next()' to pass control to the next middleware or route handler. If not authenticated, it
 * redirects the user to the login page.
 *
 * @param {Object} req - The HTTP request object, provided by Express.
 * @param {Object} res - The HTTP response object, provided by Express.
 * @param {Function} next - Callback function to pass execution to the next middleware or route handler.
 * @returns {void} Does not return a value; either calls the next middleware in the stack or redirects.
 */
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

module.exports = { isAuthenticated }