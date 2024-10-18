const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const config = require('../../config.json');
const { isAdmin } = require('../../utils/isAdmin.js');

router.get('/admin/overview', isAdmin, async (req, res) => {
  try {
    const users = await db.get('users') || [];
    const nodes = await db.get('nodes') || [];
    const images = await db.get('images') || [];
    const instances = await db.get('instances') || [];

    // Calculate the total number of each type of object
    const usersTotal = users.length;
    const nodesTotal = nodes.length;
    const imagesTotal = images.length;
    const instancesTotal = instances.length;

    res.render('admin/overview', {
      req,
      user: req.user,
      usersTotal,
      nodesTotal,
      imagesTotal,
      instancesTotal,
      version: config.version
    });
  } catch (error) {
    res.status(500).send({ error: 'Failed to retrieve data from the database.' });
  }
});

module.exports = router;