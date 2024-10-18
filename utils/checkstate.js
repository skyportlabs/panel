const axios = require('axios');
const { db } = require('../handlers/db.js');
const log = new (require('cat-loggr'))();

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
          return;
        }
  
        if (++attempts < maxAttempts) {
          setTimeout(checkState, delay);
        } else {
          log.error(`Container ${volumeId} failed to become active after ${maxAttempts} attempts.`);
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
        log.error(`Error checking state for container ${volumeId}:`, error);
        if (++attempts < maxAttempts) {
          setTimeout(checkState, delay);
        } else {
          log.info(`Container ${volumeId} state check failed after ${maxAttempts} attempts.`);
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

module.exports = { checkContainerState };