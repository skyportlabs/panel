const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const axios = require('axios');
const { db } = require('../handlers/db.js');

const saltRounds = 10;

// Middleware to check for a valid API key
async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }

  try {
    const apiKeys = await db.get('apiKeys') || [];
    const validKey = apiKeys.find(key => key.key === apiKey);

    if (!validKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    req.apiKey = validKey;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to validate API key' });
  }
}

// Users
router.post('/api/users/create', validateApiKey, async (req, res) => {
  try {
    const { username, password, admin } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const userExists = await db.get('users').then(users => 
      users && users.some(user => user.username === username)
    );

    if (userExists) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const user = {
      userId: uuidv4(),
      username,
      password: await bcrypt.hash(password, saltRounds),
      admin: admin === true
    };

    let users = await db.get('users') || [];
    users.push(user);
    await db.set('users', users);

    res.status(201).json({ userId: user.userId, username: user.username, admin: user.admin });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Work but bugged by sessions.db 
// router.delete('/api/users/delete', validateApiKey, async (req, res) => {
//   try {
//     const { username } = req.body;
// 
//     if (!username) {
//       return res.status(400).json({ error: 'Username is required' });
//     }
// 
//     let users = await db.get('users') || [];
//     const userIndex = users.findIndex(user => user.username === username);
// 
//     if (userIndex === -1) {
//       return res.status(404).json({ error: 'User not found' });
//     }
// 
//     users.splice(userIndex, 1);
//     await db.set('users', users);
// 
//     res.status(200).json({ message: 'User deleted successfully' });
//   } catch (error) {
//     res.status(500).json({ error: 'Failed to delete user' });
//   }
// });

router.get('/api/users', validateApiKey, async (req, res) => {
  try {
    const users = await db.get('users') || [];

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve user' });
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
    primary,
  } = req.body;

  if (!image || !memory || !cpu || !ports || !nodeId || !name || !user || !primary) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const NodeId = nodeId;
  const Memory = parseInt(memory);
  const Cpu = parseInt(cpu);
  const ExposedPorts = {};
  const PortBindings = {};
  const PrimaryPort = primary;

  let rawImage = await db.get('images');
  rawImage = rawImage.find(i => i.Image === image);
  const Env = rawImage ? rawImage.Env : undefined;
  const Scripts = rawImage ? rawImage.Scripts : undefined;

  const Node = await db.get(NodeId + '_node');
  if (!Node) return res.status(400).json({ error: 'Invalid node' });

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
      Image: image,
      Env,
      Scripts,
      Memory,
      Cpu,
      ExposedPorts: {},
      PortBindings: {}
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

  try {
    const response = await axios(RequestData);

    // Attempt to get the user's current server list
    const userId = user;
    const userServers = await db.get(`${userId}_instances`) || [];
    const globalServers = await db.get('instances') || [];

    // Append the new server ID to the user's server list
    userServers.push({
      Name: name,
      Node,
      User: userId,
      ContainerId: response.data.containerId,
      VolumeId: response.data.volumeId,
      Memory,
      Cpu,
      Ports: ports,
      Primary: PrimaryPort,
      ExposedPorts,
      PortBindings
    });

    globalServers.push({
      Name: name,
      Node,
      User: userId,
      ContainerId: response.data.containerId,
      VolumeId: response.data.volumeId,
      Memory,
      Cpu,
      Ports: ports,
      Primary: PrimaryPort,
      ExposedPorts,
      PortBindings
    });

    // Save the updated list back to the database
    await db.set(`${userId}_instances`, userServers);
    await db.set(`instances`, globalServers);

    await db.set(`${response.data.containerId}_instance`, {
      Name: name,
      Node,
      Image: image,
      User: userId,
      ContainerId: response.data.containerId,
      VolumeId: response.data.volumeId,
      Memory,
      Cpu,
      Ports: ports,
      Primary: PrimaryPort,
      ExposedPorts,
      PortBindings
    });

    res.status(201).json({
      Message: 'Container created successfully and added to user\'s servers',
      ContainerId: response.data.containerId,
      VolumeId: response.data.volumeId
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({
      error: 'Failed to create container',
      details: error.response ? error.response.data : 'No additional error info'
    });
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

module.exports = router;
