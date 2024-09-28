const express = require('express');
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditlog');
const { v4: uuid } = require('uuid');

const router = express.Router();

/**
 * Checks the state of a container and updates the database accordingly.
 * @param {string} volumeId - The ID of the volume.
 * @param {string} nodeAddress - The address of the node.
 * @param {string} nodePort - The port of the node.
 * @param {string} apiKey - The API key for authentication.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<void>}
 */
async function checkContainerState(volumeId, nodeAddress, nodePort, apiKey, userId) {
  let attempts = 0;
  const maxAttempts = 50;
  const delay = 30000; // 30 seconds

  const checkState = async () => {
    try {
      const response = await axios({
        method: 'get',
        url: `http://${nodeAddress}:${nodePort}/state/${volumeId}`,
        auth: {
          username: 'Skyport',
          password: apiKey,
        },
      });

      const { state, containerId } = response.data;

      // Update the database with the new state and containerId
      const instance = await db.get(`${volumeId}_instance`);
      instance.InternalState = state;
      instance.ContainerId = containerId;
      await db.set(`${volumeId}_instance`, instance);

      // Update user instances
      const userInstances = await db.get(`${userId}_instances`);
      const updatedUserInstances = userInstances.map(i => 
        i.Id === volumeId ? { ...i, InternalState: state, ContainerId: containerId } : i
      );
      await db.set(`${userId}_instances`, updatedUserInstances);

      // Update global instances
      const globalInstances = await db.get('instances');
      const updatedGlobalInstances = globalInstances.map(i => 
        i.Id === volumeId ? { ...i, InternalState: state, ContainerId: containerId } : i
      );
      await db.set('instances', updatedGlobalInstances);

      if (state === 'READY') {
        console.log(`Container ${volumeId} is now active - installation has finished.`);
        return;
      }

      if (++attempts < maxAttempts) {
        setTimeout(checkState, delay);
      } else {
        console.log(`Container ${volumeId} failed to become active after ${maxAttempts} attempts.`);
        // Update state to FAILED in all relevant places
        instance.InternalState = 'FAILED';
        await db.set(`${volumeId}_instance`, instance);
        await db.set(`${userId}_instances`, updatedUserInstances.map(i => 
          i.Id === volumeId ? { ...i, InternalState: 'FAILED' } : i
        ));
        await db.set('instances', updatedGlobalInstances.map(i => 
          i.Id === volumeId ? { ...i, InternalState: 'FAILED' } : i
        ));
      }
    } catch (error) {
      console.error(`Error checking state for container ${volumeId}:`, error);
      if (++attempts < maxAttempts) {
        setTimeout(checkState, delay);
      } else {
        console.log(`Container ${volumeId} state check failed after ${maxAttempts} attempts.`);
        // Update state to FAILED in all relevant places (same as above)
        const instance = await db.get(`${volumeId}_instance`);
        instance.InternalState = 'FAILED';
        await db.set(`${volumeId}_instance`, instance);
        const userInstances = await db.get(`${userId}_instances`);
        await db.set(`${userId}_instances`, userInstances.map(i => 
          i.Id === volumeId ? { ...i, InternalState: 'FAILED' } : i
        ));
        const globalInstances = await db.get('instances');
        await db.set('instances', globalInstances.map(i => 
          i.Id === volumeId ? { ...i, InternalState: 'FAILED' } : i
        ));
      }
    }
  };

  checkState();
}

/**
 * Middleware to verify if the user is an administrator.
 * Checks if the user object exists and if the user has admin privileges. If not, redirects to the
 * home page. If the user is an admin, proceeds to the next middleware or route handler.
 *
 * @param {Object} req - The request object, containing user data.
 * @param {Object} res - The response object.
 * @param {Function} next - The next middleware or route handler to be executed.
 * @returns {void} Either redirects or proceeds by calling next().
 */
function isAdmin(req, res, next) {
  if (!req.user || req.user.admin !== true) {
    return res.redirect('../');
  }
  next();
}

/**
 * GET /instances/deploy
 * Handles the deployment of a new instance based on the parameters provided via query strings.
 */
router.get('/instances/deploy', isAdmin, async (req, res) => {
  const { image, imagename, memory, cpu, ports, nodeId, name, user, primary, variables } =
    req.query;
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
    console.error('Error deploying instance:', error);
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
