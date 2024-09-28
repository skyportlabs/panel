const { db } = require('../handlers/db.js');

// Analytics middleware
const analyticsMiddleware = async (req, res, next) => {
  const timestamp = Date.now();
  const path = req.path;
  const method = req.method;
  const ip = req.ip;
  const userAgent = req.get('User-Agent');

  // Fetch existing analytics data
  let analytics = await db.get('analytics') || [];

  // Push new data
  analytics.push({
    timestamp,
    path,
    method,
    ip,
    userAgent
  });

  // Clean up old data (older than 24 hours)
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  analytics = analytics.filter(item => item.timestamp >= oneDayAgo);

  // Save updated analytics data
  await db.set('analytics', analytics);

  next();
};

module.exports = analyticsMiddleware;