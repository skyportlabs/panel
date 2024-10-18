const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditLog.js');
const { isAdmin } = require('../../utils/isAdmin.js');
const log = new (require('cat-loggr'))();

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

router.get('/admin/nodes', isAdmin, async (req, res) => {
  let nodes = await db.get('nodes') || [];
  let instances = await db.get('instances') || [];
  let set = {};
  nodes.forEach(function(node) {
    set[node] = 0;
    instances.forEach(function(instance) {
      if (instance.Node.id == node) {
        set[node]++;
      }
    });
  });
  nodes = await Promise.all(nodes.map(id => db.get(id + '_node').then(checkNodeStatus)));

  res.render('admin/nodes', { 
    req,
    user: req.user,
    nodes,
    set
  });
});

router.get('/admin/node/:id/stats', isAdmin, async (req, res) => {
  const { id } = req.params;

  let node = await db.get(id + '_node').then(checkNodeStatus);
  if (!node) {
    return res.status(404).send('Node not found');
  }

  let instances = await db.get('instances') || [];
  let instanceCount = 0;
  instances.forEach(function(instance) {
    if (instance.Node.id == id) {
      instanceCount++;
    }
  });

  let stats = {};
  let status = 'Offline';
  
  try {
    const response = await axios.get(`http://Skyport:${node.apiKey}@${node.address}:${node.port}/stats`);
    stats = response.data;

    if (stats && stats.uptime !== '0d 0h 0m') {
      status = 'Online';
    }
  } catch (error) {
  }

  let set = {};
  set[id] = instanceCount;

  res.render('admin/nodestats', { 
    req,
    user: req.user,
    stats,
    node,
    set,
    status
  });
});

router.post('/nodes/create', isAdmin, async (req, res) => {
  const configureKey = uuidv4();
  const node = {
    id: uuidv4(),
    name: req.body.name,
    tags: req.body.tags,
    ram: req.body.ram,
    disk: req.body.disk,
    processor: req.body.processor,
    address: req.body.address,
    port: req.body.port,
    apiKey: null,
    configureKey: configureKey,
    status: 'Unconfigured'
  };

  if (!req.body.name || !req.body.tags || !req.body.ram || !req.body.disk || !req.body.processor || !req.body.address || !req.body.port) {
    return res.status(400).send('Form validation failure.');
  }

  await db.set(node.id + '_node', node);

  const nodes = await db.get('nodes') || [];
  nodes.push(node.id);
  await db.set('nodes', nodes);

  logAudit(req.user.userId, req.user.username, 'node:create', req.ip);
  res.status(201).json({
    ...node,
    configureKey: configureKey
  });
});

router.post('/nodes/delete', isAdmin, async (req, res) => {
  const { nodeId } = req.body;
  if (!nodeId) {
    return res.status(400).json({ error: 'Missing nodeId' });
  }

  try {
    const nodes = await db.get('nodes') || [];
    let foundNode = null;

    for (const id of nodes) {
      const node = await db.get(id + '_node');
      if (node && node.id === nodeId) {
        foundNode = node;
        break;
      }
    }

    if (!foundNode) {
      return res.status(404).json({ error: 'Node not found' });
    }

    const node = foundNode;
    let instances = await db.get('instances') || [];
    let set = {};

    nodes.forEach(function(id) {
      set[id] = 0;
      instances.forEach(function(instance) {
        if (instance.Node.id === id) {
          set[id]++;
        }
      });
    });

    if (set[node.id] > 0) {
      if (!req.query.deleteinstances || req.query.deleteinstances === 'false') {
        return res.status(400).json({ error: 'There are instances on the node' });
      }

      if (req.query.deleteinstances === 'true') {
        let delinstances = instances.filter(function(instance) {
          return instance.Node.id === node.id;
        });

        instances = instances.filter(function(instance) {
          return instance.Node.id !== node.id;
        });

        await db.set('instances', instances);

        for (const instance of delinstances) {
          await db.delete(instance.Id + '_instance');
        }

        for (const instance of delinstances) {
          let userInstances = await db.get(instance.User + '_instances') || [];
          userInstances = userInstances.filter(inst => inst.Id !== instance.Id);
          await db.set(instance.User + '_instances', userInstances);
        }

        try {
          await axios.get(`http://Skyport:${node.apiKey}@${node.address}:${node.port}/instances/purge/all`);
        } catch (apiError) {
          log.error('Error calling purge API:', apiError);
        }
      }
    }

    await db.delete(node.id + '_node');
    nodes.splice(nodes.indexOf(node.id), 1);
    await db.set('nodes', nodes);

    logAudit(req.user.userId, req.user.username, 'node:delete', req.ip);
    res.status(200).json({ success: true });
  } catch (error) {
    log.error('Error deleting node:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * POST /nodes/configure
 * Allows a node to set its own access key using the configureKey.
 * The request must include a valid authKey from config.json for security.
 */
router.post('/nodes/configure', async (req, res) => {
    const { configureKey, accessKey } = req.query;
  
    if (!configureKey || !accessKey) {
      return res.status(400).json({ error: 'Missing configureKey or accessKey' });
    }
  
    try {
      // Find the node with the matching configureKey
      const nodes = await db.get('nodes') || [];
      let foundNode = null;
      for (const nodeId of nodes) {
        const node = await db.get(nodeId + '_node');
        if (node && node.configureKey === configureKey) {
          foundNode = node;
          break;
        }
      }
  
      if (!foundNode) {
        return res.status(404).json({ error: 'Node not found' });
      }
  
      // Update the node with the new accessKey
      foundNode.apiKey = accessKey;
      foundNode.status = 'Configured';
      foundNode.configureKey = null; // Remove the configureKey after successful configuration
  
      await db.set(foundNode.id + '_node', foundNode);
  
      res.status(200).json({ message: 'Node configured successfully' });
    } catch (error) {
      log.error('Error configuring node:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

router.get('/admin/node/:id/configure-command', isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the node from the database
    const node = await db.get(id + '_node');

    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    // Generate a new configure key
    const configureKey = uuidv4();

    // Update the node with the new configure key
    node.configureKey = configureKey;
    await db.set(id + '_node', node);

    // Construct the configuration command
    const panelUrl = `${req.protocol}://${req.get('host')}`;
    const configureCommand = `npm run configure -- --panel ${panelUrl} --key ${configureKey}`;

    // Return the configuration command
    res.json({
      nodeId: id,
      configureCommand: configureCommand
    });

  } catch (error) {
    log.error('Error generating configure command:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/admin/node/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  const node = await db.get(id + '_node');

  if (!node || !id) return res.redirect('../nodes')

  res.render('admin/node', {
    req,
    user: req.user,
    node
  });
});

router.post('/admin/node/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  const cnode = await db.get(id + '_node');

  if (!cnode || !id) return res.status(400).send();
  
  const node = {
    id: id,
    name: req.body.name,
    tags: req.body.tags,
    ram: req.body.ram,
    disk: req.body.disk,
    processor: req.body.processor,
    address: req.body.address,
    port: req.body.port,
    apiKey: req.body.apiKey,
    status: 'Unknown'
  };

  await db.set(node.id + '_node', node); 
  const updatedNode = await checkNodeStatus(node);
  res.status(201).send(updatedNode);
});

router.post('/admin/nodes/radar/check', isAdmin, async (req, res) => {
  try {
    const nodes = await db.get('nodes') || [];
    let instances = await db.get('instances') || [];

    for (const nodeid of nodes) {
      const node = await db.get(`${nodeid}_node`);
      if (node) {
        const nodestatus = await checkNodeStatus(node);
        if (nodestatus) {
          try {
            const response = await axios.get(`http://${node.address}:${node.port}/check/all`, {
              auth: {
                username: 'Skyport',
                password: node.apiKey
              }
            });
            
            if (response.data.flaggedMessages.length > 0) {
              for (const message of response.data.flaggedMessages) {
                const { containerId, message: flaggedMessage } = message;
                for (let instance of instances) {
                  if (instance.ContainerId === containerId) {
                    instance.suspended = true;
                    instance['suspended-flagg'] = flaggedMessage;
                  }
                }
              }
            }
          } catch (error) {
            if (error.response && error.response.status === 401) {
            } else {
              console.error(`Error checking node ${nodeid}:`, error.message);
            }
          }
        }
      }
    }

    await db.set('instances', instances);

    res.status(200).send('Node checks completed.');
  } catch (error) {
    console.error('Error during node check:', error.message);
    res.status(500).send('An error occurred while checking nodes.');
  }
});

module.exports = router;