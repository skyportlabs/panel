const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditLog.js');
const { isAdmin } = require('../../utils/isAdmin.js');

router.get('/admin/apikeys', isAdmin, async (req, res) => {
  try {
    res.render('admin/apikeys', {
      req,
      user: req.user,
      apiKeys: await db.get('apiKeys') || [],
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve API keys' });
  }
});

router.post('/apikeys/create', isAdmin, async (req, res) => {
  try {
    const newApiKey = {
      id: uuidv4(),
      key: 'skyport_' + uuidv4(),
      createdAt: new Date().toISOString()
    };
    
    let apiKeys = await db.get('apiKeys') || [];
    apiKeys.push(newApiKey);
    await db.set('apiKeys', apiKeys);
    
    logAudit(req.user.userId, req.user.username, 'apikey:create', req.ip);
    res.status(201).json(newApiKey);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.delete('/apikeys/delete', isAdmin, async (req, res) => {
  try {
    const { keyId } = req.body;
    let apiKeys = await db.get('apiKeys') || [];
    apiKeys = apiKeys.filter(key => key.id !== keyId);
    await db.set('apiKeys', apiKeys);
    logAudit(req.user.userId, req.user.username, 'apikey:delete', req.ip);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

module.exports = router;