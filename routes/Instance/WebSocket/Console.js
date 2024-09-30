const express = require('express');
const router = express.Router();
const WebSocket = require('ws');
const { db } = require('../../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../../utils/authHelper');

router.ws("/console/:id", async (ws, req) => {
    if (!req.user) return ws.close(1008, "Authorization required");

    const { id } = req.params;
    const instance = await db.get(id + '_instance');

    if (!instance || !id) return ws.close(1008, "Invalid instance or ID");

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
    if (!isAuthorized) {
        return ws.close(1008, "Unauthorized access");
    }

    const node = instance.Node;
    const socket = new WebSocket(`ws://${node.address}:${node.port}/exec/${instance.ContainerId}`);

    socket.onopen = () => {
        socket.send(JSON.stringify({ "event": "auth", "args": [node.apiKey] }));
    };

    socket.onmessage = msg => {
        ws.send(msg.data);
    };

    socket.onerror = (error) => {
        ws.send('\x1b[31;1mThis instance is unavailable! \n\x1b[0mThe skyportd instance appears to be down. Retrying...\n')
    };

    socket.onclose = (event) => {};

    ws.onmessage = msg => {
        socket.send(msg.data);
    };

    ws.on('close', () => {
        socket.close(); 
    });
});

/* you'll remember in November, someone knows the meaning of this */
/* SSB0aGluayB0aGlzIHRpbWUgSSdtIGR5aW5nCkknbSBub3QgbWVsb2RyYW1hdGljCkknbSBqdXN0IHByYWdtYXRpYyBiZXlvbmQgYW55ClJlYXNvbmluZyBmb3IgdGhpbmtpbmcgSSd2ZSBnb3QgZnVja2luZyByYWJpZXMgb3Igc29tZXRoaW5n */
module.exports = router;