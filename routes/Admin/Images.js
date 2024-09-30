const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditLog.js');
const { isAdmin } = require('../../utils/isAdmin.js');
const log = new (require('cat-loggr'))();

router.get('/admin/images', isAdmin, async (req, res) => {
  const images = await db.get('images') || [];
  res.render('admin/images', {
    req,
    user: req.user,
    images
  });
});

router.post('/admin/images/upload', isAdmin, async (req, res) => {
  try {
    let jsonData = req.body;
    jsonData.Id = uuidv4();
    let images = await db.get('images') || [];
    images.push(jsonData);
    await db.set('images', images);
    logAudit(req.user.userId, req.user.username, 'image:upload', req.ip);
    res.status(200).send('Image uploaded successfully.');
  } catch (err) {
    log.error('Error uploading image:', err);
    res.status(500).send('Error uploading image.');
  }
});

router.post('/admin/images/delete', isAdmin, async (req, res) => {
  try {
    let { id } = req.body;
    let images = await db.get('images') || [];
    images = images.filter(image => image.Id !== id);
    await db.set('images', images);
    logAudit(req.user.userId, req.user.username, 'image:delete', req.ip);
    res.status(200).send('Image deleted successfully.');
  } catch (err) {
    log.error('Error deleting image:', err);
    res.status(500).send('Error deleting image.');
  }
});

module.exports = router;