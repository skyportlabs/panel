const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isAdmin } = require('../../utils/isAdmin.js');
const log = new (require('cat-loggr'))();

router.get('/admin/auditlogs', isAdmin, async (req, res) => {
  try {
    let audits = await db.get('audits');
    audits = audits ? JSON.parse(audits) : [];
    res.render('admin/auditlogs', {
      req,
      user: req.user,
      audits
    });
  } catch (err) {
    log.error('Error fetching audits:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;