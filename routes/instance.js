/**
 * @fileoverview This module provides API routes for managing instances including fetching
 * specific instances, and handling WebSocket connections for console and statistics streams.
 * Requires user authentication for access to the endpoints.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const axios = require('axios');
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

/**
 * GET /instance/:id
 * Renders the page for a specific instance identified by its unique ID.
 * The endpoint checks for user authentication, retrieves the instance details from the database,
 * and renders the 'instance' view with the retrieved data.
 *
 * @param {string} id - The unique identifier of the instance to fetch.
 * @returns {Response} Redirects to the instances overview page if the instance does not exist
 * or the ID is not provided. Otherwise, renders the instance page with appropriate data.
 */
router.get("/instance/:id", async (req, res) => {
    if (!req.user) return res.redirect('/')

    const { id } = req.params;
    const instance = await db.get(id + '_instance');

    if (!id) return res.redirect('/'); // no ID

    // Authorization check
    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.ContainerId);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    if (!instance || !id) return res.redirect('../instances')

    res.render('instance', { req, instance, user: req.user, name: await db.get('name') || 'Skyport' });
});

/**
 * GET /instance/:id/files
 * Retrieves and renders a list of files from a specific instance identified by its unique ID.
 * The endpoint requires user authentication and valid instance details, including volume and node
 * information to construct the appropriate API call to the storage service. It supports an optional
 * query parameter for path to specify subdirectories within the instance's volume.
 *
 * @param {string} id - The unique identifier of the instance to fetch files from.
 * @param {string} [path] - Optional. Specifies a subdirectory path within the instance's volume.
 * @returns {Response} Renders the 'files' view with the files list if successful or redirects to
 * the instance overview page if the instance is not found. It also handles errors related to file
 * retrieval and invalid node configurations.
 */
router.get("/instance/:id/files", async (req, res) => {
    if (!req.user) {
        return res.redirect('/');
    }

    const { id } = req.params;
    if (!id) {
        return res.redirect('../instances');
    }

    const instance = await db.get(id + '_instance').catch(err => {
        console.error('Failed to fetch instance:', err);
        return null; // Handle the error and return null if instance fetch fails
    });

    // Authorization check
    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.ContainerId);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    if (!instance || !instance.VolumeId) {
        return res.redirect('../instances');
    }

    let query;
    if (req.query.path) {
        query = '?path=' + req.query.path
    } else {
        query = ''
    }

    if (instance.Node && instance.Node.address && instance.Node.port) {
        const RequestData = {
            method: 'get',
            url: `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/files${query}`,
            auth: {
                username: 'Skyport',
                password: instance.Node.apiKey
            },
            headers: { 
                'Content-Type': 'application/json'
            }
        };

        try {
            const response = await axios(RequestData);
            const files = response.data.files || [];

            res.render('files', { req, files, user: req.user, name: await db.get('name') || 'Skyport' });
        } catch (error) {
            console.error('Failed to fetch files:', error);
            res.status(500).render('500', { error: error.response.data.message });
        }
    } else {
        res.status(500).send('Invalid instance node configuration');
    }
});

/**
 * GET /instance/:id/file/view/:file
 * Retrieves and renders a file's content from a specific instance identified by its unique ID.
 * The endpoint requires user authentication and valid instance details, including volume and node
 * information to construct the appropriate API call to the storage service. It supports an optional
 * query parameter for path to specify subdirectories within the instance's volume.
 *
 * @param {string} id - The unique identifier of the instance to fetch files from.
 * @param {string} file - The file that you want to view the content of.
 * @param {string} [path] - Optional. Specifies a subdirectory path within the instance's volume.
 * @returns {Response} Renders the view file page with 'file' as the content.
 */
router.get("/instance/:id/files/view/:file", async (req, res) => {
    if (!req.user) {
        return res.redirect('/');
    }

    const { id, file } = req.params;
    if (!id || !file) {
        return res.redirect('../instances');
    }

    const instance = await db.get(id + '_instance').catch(err => {
        console.error('Failed to fetch instance:', err);
        return null;
    });

    // Authorization check
    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.ContainerId);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    if (!instance || !instance.VolumeId) {
        return res.redirect('../instances');
    }

    let query;
    if (req.query.path) {
        query = '?path=' + req.query.path
    } else {
        query = ''
    }

    if (instance.Node && instance.Node.address && instance.Node.port) {
        const RequestData = {
            method: 'get',
            url: `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/files/view/${file}${query}`,
            auth: {
                username: 'Skyport',
                password: instance.Node.apiKey
            },
            headers: { 
                'Content-Type': 'application/json'
            }
        };

        try {
            const response = await axios(RequestData);
            const file = response.data.content || [];

            res.render('file', { req, file, user: req.user, name: await db.get('name') || 'Skyport' });
        } catch (error) {
            console.error('Failed to fetch file:', error);
            res.status(500).render('500', { error: error.response.data.message });
        }
    } else {
        res.status(500).send('Invalid instance node configuration');
    }
});

/**
 * WebSocket /console/:id
 * Establishes a WebSocket connection to stream console logs from a specific instance.
 * Requires user authentication and valid instance ID. It connects to another WebSocket service
 * that provides real-time log data, handling both incoming and outgoing messages.
 *
 * @param {string} id - The unique identifier of the instance for which logs are requested.
 * @returns {void} Closes the WebSocket connection with appropriate status codes and messages
 * if authorization fails, the instance is invalid, or the backend service is down.
 */
router.ws("/console/:id", async (ws, req) => {
    if (!req.user) return ws.close(1008, "Authorization required"); 

    const { id } = req.params;
    const instance = await db.get(id + '_instance');

    if (!instance || !id) return ws.close(1008, "Invalid instance or ID"); 

    // Authorization check
    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.ContainerId);
    if (!isAuthorized) {
        return ws.close(1008, "Unauthorized access");
    }

    const node = instance.Node;
    const socket = new WebSocket(`ws://${node.address}:${node.port}/logs/${id}`);

    socket.onopen = () => {
        socket.send(JSON.stringify({ "event": "auth", "args": [node.apiKey] }));
    };

    socket.onmessage = msg => {
        ws.send(msg.data);
    };

    socket.onerror = (error) => {
        ws.send('\x1b[31;1mThis instance is unavailable! \n\x1b[0mThe skyportd instance appears to be down. Retrying...')
    };

    socket.onclose = (event) => {};

    ws.onmessage = msg => {
        socket.send(msg.data);
    };

    ws.on('close', () => {
        socket.close(); 
    });
});

/**
 * WebSocket /stats/:id
 * Opens a WebSocket connection to stream real-time statistics of a specific instance.
 * User authentication and a valid instance ID are required. Similar to the console WebSocket,
 * it connects to a backend service to fetch and relay statistics data.
 *
 * @param {string} id - The unique identifier of the instance for which stats are requested.
 * @returns {void} Closes the WebSocket connection with a status code and message if there are
 * issues with authorization, instance validity, or backend service connectivity.
 */
router.ws("/stats/:id", async (ws, req) => {
    if (!req.user) return ws.close(1008, "Authorization required");  // Use ws.close with a reason

    const { id } = req.params;
    const instance = await db.get(id + '_instance');

    if (!instance || !id) return ws.close(1008, "Invalid instance or ID");  // Use ws.close with a reason

    // Authorization check
    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.ContainerId);
    if (!isAuthorized) {
        return ws.close(1008, "Unauthorized access");
    }

    const node = instance.Node;
    const socket = new WebSocket(`ws://${node.address}:${node.port}/stats/${id}`);

    socket.onopen = () => {
        socket.send(JSON.stringify({ "event": "auth", "args": [node.apiKey] }));
    };

    socket.onmessage = msg => {
        ws.send(msg.data);
    };

    socket.onerror = (error) => {
        ws.send('\x1b[31;1mThis instance is unavailable! \x1b[0mThe skyportd instance appears to be down. Retrying...')
    };

    socket.onclose = (event) => {};

    ws.onmessage = msg => {
        socket.send(msg.data);
    };

    ws.on('close', () => {
        socket.close(); 
    });
});

module.exports = router;