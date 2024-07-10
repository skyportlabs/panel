// /utils/authHelper.js

const { db } = require('../handlers/db.js');

/**
 * Checks if the user is authorized to access the specified container ID.
 * @param {string} userId - The unique identifier of the user.
 * @param {string} containerId - The container ID to check authorization for.
 * @returns {Promise<boolean>} True if the user is authorized, otherwise false.
 */
async function isUserAuthorizedForContainer(userId, containerId) {
    try {
        const userInstances = await db.get(userId + '_instances');
        if (!userInstances) {
            console.error('No instances found for user:', userId);
            return false;
        }
        
        return userInstances.some(instance => instance.ContainerId === containerId);
    } catch (error) {
        console.error('Error fetching user instances:', error);
        return false;
    }
}

module.exports = {
    isUserAuthorizedForContainer
};