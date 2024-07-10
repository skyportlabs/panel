const express = require('express');
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditlog');

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
 * PUT /instances/edit/:id
 * Handles the editing of an existing instance.
 */
router.put('/instances/edit/:id', isAdmin, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const { id } = req.params;
  const { Image, Memory, Cpu } = req.body;

  try {
    const instance = await db.get(`${id}_instance`);
    if (!instance) {
      return res.status(404).json({ message: 'Instance not found' });
    }

    const requestData = prepareEditRequestData(instance, Image, Memory, Cpu);
    const response = await axios(requestData);

    const updatedInstance = await updateInstanceInDatabase(id, instance, Image, Memory, Cpu, response.data.newContainerId);

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

function prepareEditRequestData(instance, Image, Memory, Cpu) {
  const node = instance.Node;
  return {
    method: 'put',
    url: `http://${node.address}:${node.port}/instances/edit/${instance.ContainerId}`,
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
}

async function updateInstanceInDatabase(id, instance, Image, Memory, Cpu, newContainerId) {
  const updatedInstance = {
    ...instance,
    Image: Image || instance.Image,
    Memory: Memory || instance.Memory,
    Cpu: Cpu || instance.Cpu,
    ContainerId: newContainerId
  };

  // Update user instances
  await updateUserInstances(instance.User, id, updatedInstance);

  // Update global instances
  await updateGlobalInstances(id, updatedInstance);

  // Update individual instance record
  await db.set(`${newContainerId}_instance`, updatedInstance);

  // Delete old instance record
  await db.del(`${id}_instance`);

  return updatedInstance;
}

async function updateUserInstances(userId, oldContainerId, updatedInstance) {
  const userInstances = await db.get(`${userId}_instances`) || [];
  const updatedUserInstances = userInstances.map(inst => 
    inst.ContainerId === oldContainerId ? {...inst, ...updatedInstance} : inst
  );
  await db.set(`${userId}_instances`, updatedUserInstances);
}

async function updateGlobalInstances(oldContainerId, updatedInstance) {
  const globalInstances = await db.get('instances') || [];
  const updatedGlobalInstances = globalInstances.map(inst => 
    inst.ContainerId === oldContainerId ? {...inst, ...updatedInstance} : inst
  );
  await db.set('instances', updatedGlobalInstances);
}

module.exports = router;