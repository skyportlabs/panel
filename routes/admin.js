const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { db } = require('../handlers/db.js');

// Middleware to check if user is admin
function isAdmin(req, res, next) {
  if (!req.user || req.user.admin !== true) {
    return res.redirect('../');
  }
  next();
}

// Function to check node status
async function checkNodeStatus(node) {
  try {
    const RequestData = {
      method: 'get',
      url: 'http://' + node.address + ':' + node.port + '/',
      auth: {
        username: 'Skyport',
        password: node.apiKey
      },
      headers: { 
        'Content-Type': 'application/json'
      }
    };
    const response = await axios(RequestData);
    const { versionFamily, versionRelease, online, remote, docker } = response.data;

    node.status = 'Online';
    node.versionFamily = versionFamily;
    node.versionRelease = versionRelease;
    node.remote = remote;
    node.docker = docker;

    await db.set(node.id + '_node', node); // Update node info with new details
    return node;
  } catch (error) {
    node.status = 'Offline';
    await db.set(node.id + '_node', node); // Update node as offline if there's an error
    return node;
  }
}

// List all nodes with updated statuses
router.get('/nodes/debug', isAdmin, async (req, res) => {
  const nodeIds = await db.get('nodes') || [];
  const nodes = await Promise.all(nodeIds.map(id => db.get(id + '_node').then(checkNodeStatus)));
  res.json(nodes);
});

router.get('/account/debug', isAdmin, async (req, res) => {
  if (!req.user) res.send('no req.user present!')
  res.json(req.user);
});

// Create a node
router.post('/nodes/create', isAdmin, async (req, res) => {
  const node = {
    id: uuidv4(),
    name: req.body.name,
    tags: req.body.tags,
    ram: req.body.ram,
    disk: req.body.disk,
    processor: req.body.processor,
    address: req.body.address,
    port: req.body.port,
    apiKey: req.body.apiKey,
    status: 'Unknown' // Default status
  };

  await db.set(node.id + '_node', node); // Save the initial node info
  const updatedNode = await checkNodeStatus(node); // Check and update status

  const nodes = await db.get('nodes') || [];
  nodes.push(node.id);
  await db.set('nodes', nodes);

  res.status(201).send(updatedNode);
});

// Delete a node
router.delete('/nodes/delete', isAdmin, async (req, res) => {
  const nodeId = req.body.nodeId;
  const nodes = await db.get('nodes') || [];
  const newNodes = nodes.filter(id => id !== nodeId);

  await db.set('nodes', newNodes);
  await db.delete(nodeId + '_node');

  res.status(204).send();
});

// Admin page to list nodes
router.get('/nodes', isAdmin, async (req, res) => {
  let nodes = await db.get('nodes') || [];
  nodes = await Promise.all(nodes.map(id => db.get(id + '_node').then(checkNodeStatus)));

  res.render('nodes', { user: req.user, nodes, name: await db.get('name') || 'Skyport' });
});

module.exports = router;
