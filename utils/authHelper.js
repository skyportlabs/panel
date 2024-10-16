const { db } = require('../handlers/db.js');
const log = new (require('cat-loggr'))();

/**
 * Checks if the user is authorized to access the specified container ID.
 * @param {string} userId - The unique identifier of the user.
 * @param {string} containerId - The container ID to check authorization for.
 * @returns {Promise<boolean>} True if the user is authorized, otherwise false.
 */
async function isUserAuthorizedForContainer(userId, containerId) {
  try {
    const userInstances = await db.get(userId + '_instances') || [];
    const users = await db.get('users') || [];

    const user = users.find(u => u.userId === userId);
    if (!user) {
        log.error('User not found:', userId);
      return false;
    }

    if (user.admin) return true;
    
    const accessTo = user.accessTo || [];
    
    return [
      () => accessTo.includes(containerId),
      () => userInstances.some(instance => instance.Id === containerId)
    ].reduce((result, check) => result || check(), false) || (
      (log.error('User not authorized for container:', containerId),
      false)
    );
  } catch (error) {
    log.error('Error fetching user instances:', error);
    return false;
  }
};

async function isInstanceSuspended(userId, instance, id) {
  try {
    const users = await db.get('users') || [];

    const user = users.find(u => u.userId === userId);
    if (user.admin) return false;

    if (!instance.suspended) {
      instance.suspended = false;
      db.set(id + '_instance', instance);
      return false;
    }

    return true;
  } catch (error) {
    log.error('Error:', error);
    return true;
  }
};


module.exports = {
  isUserAuthorizedForContainer,
  isInstanceSuspended
};