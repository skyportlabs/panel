const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const axios = require('axios');
const { sendPasswordResetEmail } = require('../../../handlers/email.js');
const { db } = require('../../../handlers/db.js');

const saltRounds = 10;

// Middleware to check for a valid API key
async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({error: 'API key is required' });
  }

  try {
    const apiKeys = await db.get('apiKeys') || [];
    const validKey = apiKeys.find(key => key.key === apiKey);

    if (!validKey) {
      return res.status(401).json({ error: '' });
    }

    req.apiKey = validKey;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate API key' });
  }
}

// Users
router.get('/api/users', validateApiKey, async (req, res) => {
  try {
    const users = await db.get('users') || [];

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

router.post('/api/getUser', validateApiKey, async (req, res) => {
  try {
    const { type, value } = req.body;

    if (!type || !value) {
      return res.status(400).json({ error: 'Type and value are required' });
    }

    const users = await db.get('users') || [];
    
    let user;
    if (type === 'email') {
      user = users.find(user => user.email === value);
    } else if (type === 'username') {
      user = users.find(user => user.username === value);
    } else {
      return res.status(400).json({ error: 'Invalid search type. Use "email" or "username".' });
    }
    
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }
    
    res.status(201).json(user);
  } catch (error) {
    console.error('Error retrieving user:', error);
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
});

router.post('/api/auth/create-user', validateApiKey, async (req, res) => {
  try {
    const { username, email, password, userId, admin } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const userExists = await db.get('users').then(users => 
      users && users.some(user => user.username === username)
    );

    if (userExists) {
      return res.status(409).json({ error: 'User already exists' });
    }

    if (!req.body.userId) {
      userId = uuidv4();
    }

    const user = {
      userId: userId,
      username,
      email,
      password: await bcrypt.hash(password, saltRounds),
      accessTo: [],
      admin: admin === true
    };

    let users = await db.get('users') || [];
    users.push(user);
    await db.set('users', users);

    res.status(201).json({ userId: user.userId, email, username: user.username, admin: user.admin });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.post('/api/auth/reset-password', validateApiKey, async (req, res) => {
  const { email } = req.body;

  try {
    const users = await db.get('users') || [];
    const user = users.find(u => u.email === email);

    if (!user) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const resetToken = generateRandomCode(30);
    user.resetToken = resetToken;
    await db.set('users', users);

    const smtpSettings = await db.get('smtp_settings');
    if (smtpSettings) {
      await sendPasswordResetEmail(email, resetToken);
      res.status(200).json({ message: `Password reset email sent successfully (${resetToken})` });
    } else {
      res.status(200).json({ message: resetToken });
    }
  } catch (error) {
    console.error('Error handling password reset:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Instance
router.get('/api/instances', validateApiKey, async (req, res) => {
  try {
    const instances = await db.get('instances') || [];
    res.json(instances);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve instances' });
  }
});

router.post('/api/instances/deploy', validateApiKey, async (req, res) => {
  const {
    image,
    memory,
    cpu,
    ports,
    nodeId,
    name,
    user,
    primary
  } = req.body;

  if (!image || !memory || !cpu || !ports || !nodeId || !name || !user || !primary) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const Id = uuid().split('-')[0];
    const Node = await db.get(`${nodeId}_node`);
    if (!Node) return res.status(400).json({ error: 'Invalid node' });

    let rawImage = await db.get('images');
    rawImage = rawImage.find(i => i.Image === image);
    if (!rawImage) return res.status(400).json({ error: 'Invalid image' });

    const { Env, Scripts, AltImages } = rawImage;

    const Memory = parseInt(memory);
    const Cpu = parseInt(cpu);
    const ExposedPorts = {};
    const PortBindings = {};
    const PrimaryPort = primary;

    const RequestData = {
      method: 'post',
      url: `http://${Node.address}:${Node.port}/instances/create`,
      auth: {
        username: 'Skyport',
        password: Node.apiKey
      },
      headers: { 
        'Content-Type': 'application/json'
      },
      data: {
        Name: name,
        Id,
        Image: image,
        Env,
        Scripts,
        Memory,
        Cpu,
        ExposedPorts,
        PortBindings,
        AltImages // Add AltImages to request data
      }
    };

    // Process ports
    if (ports) {
      ports.split(',').forEach(portMapping => {
        const [containerPort, hostPort] = portMapping.split(':');
        const key = `${containerPort}/tcp`;
        RequestData.data.ExposedPorts[key] = {};
        RequestData.data.PortBindings[key] = [{ HostPort: hostPort }];
      });
    }

    const response = await axios(RequestData);

    // Attempt to get the user's current server list
    const userId = user;
    const userServers = await db.get(`${userId}_instances`) || [];
    const globalServers = await db.get('instances') || [];

    // Append the new server ID to the user's server list
    const newInstance = {
      Name: name,
      Id,
      Node,
      User: userId,
      ContainerId: response.data.containerId,
      VolumeId: response.data.volumeId,
      Memory,
      Cpu,
      Ports: ports,
      Primary: PrimaryPort,
      ExposedPorts,
      PortBindings,
      Image: image,
      AltImages // Include AltImages in the new instance
    };

    userServers.push(newInstance);
    globalServers.push(newInstance);

    // Save the updated list back to the database
    await db.set(`${userId}_instances`, userServers);
    await db.set('instances', globalServers);
    await db.set(`${response.data.containerId}_instance`, newInstance);

    res.status(201).json({
      Message: 'Container created successfully and added to user\'s servers',
      ContainerId: response.data.containerId,
      VolumeId: response.data.volumeId
    });
  } catch (error) {
    console.error('Error deploying instance:', error);
    res.status(500).json({
      error: 'Failed to create container',
      details: error.response ? error.response.data : 'No additional error info'
    });
  }
});
router.delete('/api/instance/delete', validateApiKey, async (req, res) => {
  const { id } = req.body;
  
  try {
    if (!id) {
      return res.status(400).json({ error: 'Missing ID parameter' });
    }
    
    const instance = await db.get(id + '_instance');
    if (!instance) {
      return res.status(400).json({ error: 'Instance not found' });
    }
    
    await deleteInstance(instance);
    res.status(201).json({ Message: 'The instance has successfully been deleted.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete instances' });
  }
});

router.post('/api/getUserInstance', validateApiKey, async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Parameter "userId" is required' });
  }

  const userExists = await db.get('users').then(users => 
    users && users.some(user => user.userId === userId)
  );

  if (!userExists) {
    return res.status(400).json({ error: 'User not found' });
  }

  try {
    const userInstances = await db.get(`${userId}_instances`) || [];
    res.json(userInstances);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve user instances' });
  }
});

router.post('/api/getInstance', validateApiKey, async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Parameter "id" is required' });
  }

  const instanceExists = await db.get('instances').then(server => 
    server && server.some(server => server.Id === id)
  );

  if (!instanceExists) {
    return res.status(400).json({ error: 'Instance not found' });
  }

  try {
    const instances = await db.get(`${id}_instance`) || [];
    res.json(instances);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve instances' });
  }
});

// Images
router.get('/api/images', validateApiKey, async (req, res) => {
  try {
    const images = await db.get('images') || [];
    res.json(images);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve images' });
  }
});

router.get('/api/name', validateApiKey, async (req, res) => {
  try {
    const name = await db.get('name') || 'Skyport';
    res.json({ name });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve name' });
  }
});

// Nodes
router.get('/api/nodes', validateApiKey, async (req, res) => {
  try {
    const nodes = await db.get('nodes') || [];
    const nodeDetails = await Promise.all(nodes.map(id => db.get(id + '_node')));
    res.json(nodeDetails);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve nodes' });
  }
});

router.post('/api/nodes/create', validateApiKey, async (req, res) => {
  const node = {
    id: uuidv4(),
    name: req.body.name,
    tags: req.body.tags,
    ram: req.body.ram,
    disk: req.body.disk,
    processor: req.body.processor,
    address: req.body.address,
    port: req.body.port,
    apiKey: null, // Set to null initially
    configureKey: configureKey, // Add the configureKey
    status: 'Unconfigured' // Status to indicate pending configuration
  };

  if (!req.body.name || !req.body.tags || !req.body.ram || !req.body.disk || !req.body.processor || !req.body.address || !req.body.port) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  await db.set(node.id + '_node', node); // Save the initial node info
  const updatedNode = await checkNodeStatus(node); // Check and update status

  const nodes = await db.get('nodes') || [];
  nodes.push(node.id);
  await db.set('nodes', nodes);

  res.status(201).json({ Message: updatedNode });
});

router.delete('/api/nodes/delete', validateApiKey, async (req, res) => {
  const nodeId = req.body.nodeId;
  const nodes = await db.get('nodes') || [];
  const newNodes = nodes.filter(id => id !== nodeId);

  if (!nodeId) return res.send('Invalid node')

  await db.set('nodes', newNodes);
  await db.delete(nodeId + '_node');

  res.status(201).json({ Message: "The node has successfully deleted." });
});

// Function

function generateRandomCode(length) {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Helper function to delete an instance
async function deleteInstance(instance) {
  try {
    await axios.get(`http://Skyport:${instance.Node.apiKey}@${instance.Node.address}:${instance.Node.port}/instances/${instance.ContainerId}/delete`);
    
    // Update user's instances
    let userInstances = await db.get(instance.User + '_instances') || [];
    userInstances = userInstances.filter(obj => obj.ContainerId !== instance.ContainerId);
    await db.set(instance.User + '_instances', userInstances);
    
    // Update global instances
    let globalInstances = await db.get('instances') || [];
    globalInstances = globalInstances.filter(obj => obj.ContainerId !== instance.ContainerId);
    await db.set('instances', globalInstances);
    
    // Delete instance-specific data
    await db.delete(instance.ContainerId + '_instance');
  } catch (error) {
    console.error(`Error deleting instance ${instance.ContainerId}:`, error);
    throw error;
  }
}

/**
 * Checks the operational status of a node by making an HTTP request to its API.
 * Updates the node's status based on the response or sets it as 'Offline' if the request fails.
 * This status check and update are persisted in the database.
 *
 * @param {Object} node - The node object containing details such as address, port, and API key.
 * @returns {Promise<Object>} Returns the updated node object after attempting to verify its status.
 */
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

module.exports = router;
