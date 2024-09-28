const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isAdmin } = require('../../utils/isAdmin.js');

router.get('/admin/auditlogs', isAdmin, async (req, res) => {
  try {
    let audits = await db.get('audits');
    audits = audits ? JSON.parse(audits) : [];
    res.render('admin/auditlogs', {
      req,
      user: req.user,
      name: await db.get('name') || 'Skyport',
      logo: await db.get('logo') || false,
      audits
    });
  } catch (err) {
    console.error('Error fetching audits:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;