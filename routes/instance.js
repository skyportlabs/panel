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
    if (!req.user) return ws.end();

    const { id } = req.params;
    const instance = await db.get(id + '_instance');

    if (!instance || !id) return res.redirect('../instances')

    res.render('instance', { req, instance, user: req.user, name: await db.get('name') || 'Skyport' });
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