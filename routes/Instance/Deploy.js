const express = require('express');
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditLog.js');
const { checkContainerState } = require('../../utils/checkstate.js');
const { v4: uuid } = require('uuid');
const { isAdmin } = require('../../utils/isAdmin.js');
const log = new (require('cat-loggr'))();

const router = express.Router();

/**
 * GET /instances/deploy
 * Handles the deployment of a new instance based on the parameters provided via query strings.
 */
router.get('/instances/deploy', isAdmin, async (req, res) => {
  const { image, imagename, memory, cpu, ports, nodeId, name, user, primary, variables } = req.query;
  if (!image || !memory || !cpu || !ports || !nodeId || !name || !user || !primary) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  try {
    const Id = uuid().split('-')[0];
    const node = await db.get(`${nodeId}_node`);
    if (!node) {
      return res.status(400).json({ error: 'Invalid node' });
    }

    const requestData = await prepareRequestData(
      image,
      memory,
      cpu,
      ports,
      name,
      node,
      Id,
      variables,
      imagename,
    );
    const response = await axios(requestData);

    await updateDatabaseWithNewInstance(
      response.data,
      user,
      node,
      image,
      memory,
      cpu,
      ports,
      primary,
      name,
      Id,
      imagename,
    );

    // Start the state checking process
    checkContainerState(Id, node.address, node.port, node.apiKey, user);

    logAudit(req.user.userId, req.user.username, 'instance:create', req.ip);
    res.status(201).json({
      message: "Container creation initiated. State will be updated asynchronously.",
      volumeId: Id,
      state: 'INSTALLING'
    });
  } catch (error) {
    log.error('Error deploying instance:', error);
    res.status(500).json({
      error: 'Failed to create container',
      details: error.response ? error.response.data : 'No additional error info',
    });
  }
});

async function prepareRequestData(image, memory, cpu, ports, name, node, Id, variables, imagename) {
  const rawImages = await db.get('images');
  const imageData = rawImages.find(i => i.Name === imagename);

  const requestData = {
    method: 'post',
    url: `http://${node.address}:${node.port}/instances/create`,
    auth: {
      username: 'Skyport',
      password: node.apiKey,
    },
    headers: {
      'Content-Type': 'application/json',
    },
    data: {
      Name: name,
      Id,
      Image: image,
      Env: imageData ? imageData.Env : undefined,
      Scripts: imageData ? imageData.Scripts : undefined,
      Memory: memory ? parseInt(memory) : undefined,
      Cpu: cpu ? parseInt(cpu) : undefined,
      ExposedPorts: {},
      PortBindings: {},
      variables,
      AltImages: imageData ? imageData.AltImages : [],
      StopCommand: imageData ? imageData.StopCommand : undefined,
      imageData,
    },
  };

  if (ports) {
    ports.split(',').forEach(portMapping => {
      const [containerPort, hostPort] = portMapping.split(':');

      // Adds support for TCP
      const tcpKey = `${containerPort}/tcp`;
      if (!requestData.data.ExposedPorts[tcpKey]) {
        requestData.data.ExposedPorts[tcpKey] = {};
      }

      if (!requestData.data.PortBindings[tcpKey]) {
        requestData.data.PortBindings[tcpKey] = [{ HostPort: hostPort }];
      }

      // Adds support for UDP
      const udpKey = `${containerPort}/udp`;
      if (!requestData.data.ExposedPorts[udpKey]) {
        requestData.data.ExposedPorts[udpKey] = {};
      }

      if (!requestData.data.PortBindings[udpKey]) {
        requestData.data.PortBindings[udpKey] = [{ HostPort: hostPort }];
      }
    });
  }

  return requestData;
}

async function updateDatabaseWithNewInstance(
  responseData,
  userId,
  node,
  image,
  memory,
  cpu,
  ports,
  primary,
  name,
  Id,
  imagename,
) {
  const rawImages = await db.get('images');
  const imageData = rawImages.find(i => i.Name === imagename);

  let altImages = imageData ? imageData.AltImages : [];

  const instanceData = {
    Name: name,
    Id,
    Node: node,
    User: userId,
    InternalState: 'INSTALLING',
    ContainerId: responseData.containerId,
    VolumeId: Id,
    Memory: parseInt(memory),
    Cpu: parseInt(cpu),
    Ports: ports,
    Primary: primary,
    Image: image,
    AltImages: altImages,
    StopCommand: imageData ? imageData.StopCommand : undefined,
    imageData,
    Env: responseData.Env,
  };

  const userInstances = (await db.get(`${userId}_instances`)) || [];
  userInstances.push(instanceData);
  await db.set(`${userId}_instances`, userInstances);

  const globalInstances = (await db.get('instances')) || [];
  globalInstances.push(instanceData);
  await db.set('instances', globalInstances);

  await db.set(`${Id}_instance`, instanceData);
}

module.exports = router;
