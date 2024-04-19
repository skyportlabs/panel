const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../handlers/db.js'); // Import the custom database handler
const basicAuth = require('express-basic-auth');

const router = express.Router();

// Custom basic auth configuration for /instances/list
router.get('/instances/list', basicAuth({
  users: { 'Skyport': 'skyport_1' }, // Replace with your actual admin credentials
  challenge: true, // Optional, this will cause browsers to show a login dialog
  realm: 'Imb4T3st4pp' // Optional, can set a realm identifier
}), async (req, res) => {
  let instances = await db.get('instances');
  res.json(instances);
});

router.get('/instances/deploy', async (req, res) => {
  const {
    image,
    cmd,
    env,
    memory,
    cpu,
    ports,
    nodeId,
    name,
    user
  } = req.query;

  if (!image) {
    return res.status(400).json({ error: 'Image parameter is required' });
  }

  const NodeId = nodeId;
  const Name = name;
  const Cmd = cmd ? cmd.split(',') : undefined;
  const Env = env ? env.split(',') : undefined;
  const Memory = memory ? parseInt(memory) * 1024 * 1024 : undefined;
  const Cpu = cpu ? parseInt(cpu) : undefined;
  const ExposedPorts = {};
  const PortBindings = {};

  let Node = await db.get(NodeId + '_node');
  if (!Node) return res.send('invalid node');

  const NodeRemote = Node.address;
  const NodePort = Node.port;

  if (ports) {
    ports.split(',').forEach(portMapping => {
      const [containerPort, hostPort] = portMapping.split(':');
      const key = `${containerPort}/tcp`;
      ExposedPorts[key] = {};
      PortBindings[key] = [{ HostPort: hostPort }];
    });
  }

  const RequestData = {
    method: 'post',
    url: 'http://' + NodeRemote + ':' + NodePort + '/instances/create',
    auth: {
      username: 'Skyport',
      password: Node.apiKey
    },
    headers: { 
      'Content-Type': 'application/json'
    },
    data: {
      Name,
      Image: image,
      Cmd,
      Env,
      Memory,
      Cpu,
      ExposedPorts,
      PortBindings
    }
  };

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
      ContainerId: response.data.containerId,
      VolumeId: response.data.volumeId,
      Memory,
      Cpu,
      Cmd,
      Env,
      ExposedPorts,
      PortBindings
    });

    globalServers.push({
      Name: name,
      Node,
      ContainerId: response.data.containerId,
      VolumeId: response.data.volumeId,
      Memory,
      Cpu,
      Cmd,
      Env,
      ExposedPorts,
      PortBindings
  });

    // Save the updated list back to the database
    await db.set(`${userId}_instances`, userServers);
    await db.set(`instances`, globalServers);

    res.status(201).json({
      Message: 'Container created successfully and added to user\'s servers',
      ContainerId: response.data.containerId,
      VolumeId: response.data.volumeId
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({
      error: 'Failed to register container',
      details: error ? error.data : 'No additional error info'
    });
  }
});

module.exports = router;
