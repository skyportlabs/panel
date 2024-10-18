const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db');
const { isAdmin } = require('../../utils/isAdmin');

router.get('/admin/analytics', isAdmin, async (req, res) => {
  const analytics = await db.get('analytics') || [];
  
  const pageViews = analytics.reduce((acc, item) => {
    acc[item.path] = (acc[item.path] || 0) + 1;
    return acc;
  }, {});

  const methodCounts = analytics.reduce((acc, item) => {
    acc[item.method] = (acc[item.method] || 0) + 1;
    return acc;
  }, {});

  const timeSeriesData = analytics.map(item => ({
    timestamp: item.timestamp,
    path: item.path
  }));

  res.render('admin/analytics', {
    req,
    user: req.user,
    pageViews,
    methodCounts,
    timeSeriesData,
  });
});

router.get('/api/analytics', isAdmin, async (req, res) => {
  // Check if user is authenticated and has admin rights
  if (!req.user || !req.user.admin) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const analytics = await db.get('analytics') || [];

  // Process analytics data
  const totalRequests = analytics.length;
  const uniqueVisitors = new Set(analytics.map(item => item.ip)).size;
  const avgRequestsPerHour = totalRequests / 24; // Assuming 24 hours of data

  // Get top page
  const pageCounts = analytics.reduce((acc, item) => {
    acc[item.path] = (acc[item.path] || 0) + 1;
    return acc;
  }, {});
  const topPage = Object.entries(pageCounts).sort((a, b) => b[1] - a[1])[0][0];

  // Traffic over time (hourly)
  const trafficOverTime = Array(24).fill(0);
  analytics.forEach(item => {
    const hour = new Date(item.timestamp).getHours();
    trafficOverTime[hour]++;
  });

  // Top 5 pages
  const topPages = Object.entries(pageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  res.json({
    totalRequests,
    uniqueVisitors,
    avgRequestsPerHour,
    topPage,
    trafficOverTime: {
      labels: Array.from({length: 24}, (_, i) => `${i}:00`),
      data: trafficOverTime
    },
    topPages: {
      labels: topPages.map(([page]) => page),
      data: topPages.map(([, count]) => count)
    }
  });
});

module.exports = router;