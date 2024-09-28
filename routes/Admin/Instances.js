const express = require('express');
const router = express.Router();
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditlog.js');
const { isAdmin } = require('../../utils/isAdmin.js');

// we forgot checkNodeStatus
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

    await db.set(node.id + '_node', node);
    return node;
  } catch (error) {
    node.status = 'Offline';
    await db.set(node.id + '_node', node);
    return node;
  }
}

async function deleteInstance(instance) {
  try {
    await axios.get(`http://Skyport:${instance.Node.apiKey}@${instance.Node.address}:${instance.Node.port}/instances/${instance.ContainerId}/delete`);
    
    let userInstances = await db.get(instance.User + '_instances') || [];
    userInstances = userInstances.filter(obj => obj.ContainerId !== instance.ContainerId);
    await db.set(instance.User + '_instances', userInstances);
    
    let globalInstances = await db.get('instances') || [];
    globalInstances = globalInstances.filter(obj => obj.ContainerId !== instance.ContainerId);
    await db.set('instances', globalInstances);
    
    await db.delete(instance.ContainerId + '_instance');
  } catch (error) {
    console.error(`Error deleting instance ${instance.ContainerId}:`, error);
    throw error;
  }
}

router.get('/admin/instances', isAdmin, async (req, res) => {
  let instances = await db.get('instances') || [];
  let images = await db.get('images') || [];
  let nodes = await db.get('nodes') || [];
  let users = await db.get('users') || [];

  nodes = await Promise.all(nodes.map(id => db.get(id + '_node').then(checkNodeStatus)));

  res.render('admin/instances', {
    req,
    user: req.user,
    name: await db.get('name') || 'Skyport',
    logo: await db.get('logo') || false,
    instances,
    images,
    nodes,
    users
  });
});

router.get('/admin/instances/:id/edit', isAdmin, async (req, res) => {
  const { id } = req.params;
  const instance = await db.get(id + '_instance');
  let users = await db.get('users') || [];
  let images = await db.get('images') || [];

  if (!instance) return res.redirect('/admin/instances');
  res.render('admin/instance_edit', {
    req,
    user: req.user,
    name: await db.get('name') || 'Skyport',
    logo: await db.get('logo') || false,
    instance,
    images,
    users
  });
});

router.get('/admin/instance/delete/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    if (!id) {
      return res.redirect('/admin/instances');
    }
    
    const instance = await db.get(id + '_instance');
    if (!instance) {
      return res.status(404).send('Instance not found');
    }
    
    await deleteInstance(instance);
    logAudit(req.user.userId, req.user.username, 'instance:delete', req.ip);
    res.redirect('/admin/instances');
  } catch (error) {
    console.error('Error in delete instance endpoint:', error);
    res.status(500).send('An error occurred while deleting the instance');
  }
});

router.get('/admin/instances/purge/all', isAdmin, async (req, res) => {
  try {
    const instances = await db.get('instances') || [];
    
    for (const instance of instances) {
      await deleteInstance(instance);
    }
    
    await db.delete('instances');
    res.redirect('/admin/instances');
  } catch (error) {
    console.error('Error in purge all instances endpoint:', error);
    res.status(500).send('An error occurred while purging all instances');
  }
});

router.post('/admin/instances/suspend/:id', isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    if (!id) {
      return res.redirect('/admin/instances');
    }
    const instance = await db.get(id + '_instance');
    if (!instance) {
      return res.status(404).send('Instance not found');
    }

    instance.suspended = true;
    await db.set(id + '_instance', instance);
    let instances = await db.get('instances') || [];

    let instanceToSuspend = instances.find(obj => obj.ContainerId === instance.ContainerId);
    if (instanceToSuspend) {
      instanceToSuspend.suspended = true;
    }

    await db.set('instances', instances);

    logAudit(req.user.userId, req.user.username, 'instance:suspend', req.ip);
    res.redirect('/admin/instances');
  } catch (error) {
    console.error('Error in suspend instance endpoint:', error);
    res.status(500).send('An error occurred while suspending the instance');
  }
});

router.post('/admin/instances/unsuspend/:id', isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    if (!id) {
      return res.redirect('/admin/instances');
    }
    const instance = await db.get(id + '_instance');
    if (!instance) {
      return res.status(404).send('Instance not found');
    }

    instance.suspended = false;

    await db.set(id + '_instance', instance);

    let instances = await db.get('instances') || [];

    let instanceToUnsuspend = instances.find(obj => obj.ContainerId === instance.ContainerId);
    if (instanceToUnsuspend) {
      instanceToUnsuspend.suspended = false;
    }

    await db.set('instances', instances);

    logAudit(req.user.userId, req.user.username, 'instance:unsuspend', req.ip);

    res.redirect('/admin/instances');
  } catch (error) {
    console.error('Error in unsuspend instance endpoint:', error);
    res.status(500).send('An error occurred while unsuspending the instance');
  }
});

module.exports = router;