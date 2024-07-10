/**
 * @fileoverview This module provides API routes for managing deployment of instances,
 * including listing available instances with basic authentication and deploying new instances.
 * It handles interactions with a custom database and communicates with node services
 * for instance creation and deployment.
 */

const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../handlers/db.js'); // Import the custom database handler
const basicAuth = require('express-basic-auth');
const config = require('../config.json')
const {logAudit} = require('../handlers/auditlog');

const router = express.Router();

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
 * GET /images/list
 * Provides a list of all images available in the database. This does not need auth, no sensitive info is here.
 *
 * @returns {Response} Sends a JSON response containing an array of images.
 */
router.get('/images/list', async (req, res) => {
  let images = await db.get('images');
  res.json(images);
});

/**
 * GET /instances/deploy
 * Handles the deployment of a new instance based on the parameters provided via query strings.
 * It validates the required parameters, interacts with a node specific API to create the instance,
 * and updates the database with the new instance data. Error handling is included for validation
 * and remote request failures.
 *
 * @param {string} image - The Docker image name to deploy.
 * @param {string} [cmd] - Optional command to run in the container, passed as comma-separated values.
 * @param {string} [env] - Optional environment variables for the container, passed as comma-separated values.
 * @param {number} [memory] - Optional memory allocation for the container, specified in MB.
 * @param {number} [cpu] - Optional CPU share for the container.
 * @param {string} [ports] - Optional port mappings for the container, passed as comma-separated values in 'container:host' format.
 * @param {string} nodeId - Identifier for the node on which the instance will be deployed.
 * @param {string} name - Name of the instance.
 * @param {string} user - User identifier who is deploying the instance.
 * @returns {Response} Sends a 201 status with instance deployment details if successful, or an error status if deployment fails.
 */

// ... this route didn't have an admin check?
router.get('/instances/deploy', isAdmin, async (req, res) => {
  const {
    image,
    memory,
    cpu,
    ports,
    nodeId,
    name,
    user,
    primary,
  } = req.query;

  if (!image || !memory || !cpu || !ports || !nodeId || !name || !user || !primary) return res.send('Missing parameters');

  const NodeId = nodeId;
  const Memory = memory ? parseInt(memory) : undefined;
  const Cpu = cpu ? parseInt(cpu) : undefined;
  const ExposedPorts = {};
  const PortBindings = {};
  const PrimaryPort = primary;

  let rawImage = await db.get('images');
  rawImage = rawImage.find(i => i.Image === image);
  const Env = rawImage ? rawImage.Env : undefined;
  const Scripts = rawImage ? rawImage.Scripts : undefined;

  const Node = await db.get(NodeId + '_node');
  if (!Node) return res.send('Invalid node');

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
      Memory: memory ? parseInt(memory) : undefined,
      Cpu: cpu ? parseInt(cpu) : undefined,
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
    
    logAudit(req.user.userId, req.user.username, 'instance:create', req.ip);
    res.status(201).json({
      Message: 'Container created successfully and added to user\'s servers',
      ContainerId: response.data.containerId,
      VolumeId: response.data.volumeId
    });
  } catch (error) {
    console.log(error)
    res.status(500).json({
      error: 'Failed to create container',
      details: error ? error.data : 'No additional error info'
    });
  }
});

router.put('/edit/:id', isAdmin, async (req, res) => {
  if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
  }

  const { id } = req.params;
  const { Image, Memory, Cpu } = req.body;

  try {
      // Fetch the existing instance
      const instance = await db.get(`${id}_instance`);
      if (!instance) {
          return res.status(404).json({ message: 'Instance not found' });
      }

      // Prepare the request to the node
      const node = instance.Node;
      const RequestData = {
          method: 'put',
          url: `http://${node.address}:${node.port}/instances/edit/${id}`,
          auth: {
              username: 'Skyport',
              password: node.apiKey
          },
          headers: { 
              'Content-Type': 'application/json'
          },
          data: {
              Image: Image || instance.Image,
              Memory: Memory || instance.Memory,
              Cpu: Cpu || instance.Cpu,
              VolumeId: instance.VolumeId
          }
      };

      // Send the edit request to the node
      const response = await axios(RequestData);

      // Update the instance in the database
      const updatedInstance = {
          ...instance,
          Image: Image || instance.Image,
          Memory: Memory || instance.Memory,
          Cpu: Cpu || instance.Cpu,
          ContainerId: response.data.newContainerId
      };

      // Update the instance in the user's instances list
      const userInstances = await db.get(`${instance.User}_instances`) || [];
      const updatedUserInstances = userInstances.map(inst => 
          inst.ContainerId === id ? {...inst, ...updatedInstance} : inst
      );
      await db.set(`${instance.User}_instances`, updatedUserInstances);

      // Update the instance in the global instances list
      const globalInstances = await db.get('instances') || [];
      const updatedGlobalInstances = globalInstances.map(inst => 
          inst.ContainerId === id ? {...inst, ...updatedInstance} : inst
      );
      await db.set('instances', updatedGlobalInstances);

      // Update the individual instance record
      await db.set(`${response.data.newContainerId}_instance`, updatedInstance);

      // Delete the old instance record
      await db.del(`${id}_instance`);

      logAudit(req.user.userId, req.user.username, 'instance:edit', req.ip);

      res.status(200).json({
          message: 'Instance updated successfully',
          oldContainerId: id,
          newContainerId: response.data.newContainerId
      });

  } catch (error) {
      console.error('Error updating instance:', error);
      res.status(500).json({ message: 'Failed to update instance', error: error.message });
  }
});

module.exports = router;
