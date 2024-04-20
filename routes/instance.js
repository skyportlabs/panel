const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { db } = require('../handlers/db.js'); // Ensure db.js is properly set up to use Keyv

router.ws("/console/:id", async (ws, req) => {
    if (!req.user) return ws.end();
});

async function connectToConsole(id, node) {
    try {
        const ws = new WebSocket('http://' + node.address + ':' + node.port);
        ws.onopen = () => {
            ws.send(JSON.stringify({ "event": "auth", "args": [`${node.apiKey}`] }));
        };
        return ws;
    } catch (error) {
        return null;
    }
}

module.exports = router;