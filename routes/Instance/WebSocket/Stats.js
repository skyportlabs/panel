const express = require('express');
const router = express.Router();
const WebSocket = require('ws');
const { db } = require('../../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../../utils/authHelper');

router.ws("/stats/:id", async (ws, req) => {
    if (!req.user) return ws.close(1008, "Authorization required");

    const { id } = req.params;
    const instance = await db.get(id + '_instance');

    if (!instance || !id) return ws.close(1008, "Invalid instance or ID");

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
    if (!isAuthorized) {
        return ws.close(1008, "Unauthorized access");
    }

    const node = instance.Node;
    const volume = instance.VolumeId;
    const socket = new WebSocket(`ws://${node.address}:${node.port}/stats/${instance.ContainerId}/${volume}`);
    
    socket.onopen = () => {
        socket.send(JSON.stringify({ "event": "auth", "args": [node.apiKey] }));
    };
    
    socket.onmessage = msg => {
        ws.send(msg.data);
    };
    
    socket.onerror = (error) => {
        ws.send(JSON.stringify({ error: 'Stats service is temporarily unavailable' }));
    };
    
    socket.onclose = (event) => {
        ws.close(1011, 'Stats service disconnected');
    };
    
    ws.onmessage = msg => {
        socket.send(msg.data);
    };
    
    ws.on('close', () => {
        socket.close();
    });
});

/* VGhpcyBpcyBub3QgYW4gYWN0IG9mIHNwaXRlCkl0J3MgYSB2aXNjZXJhbCBjb21pbmcgdG8= */
/* VG9uaWdodCwgSSdtIGZ1Y2tpbmcgZHJ1bmsKU2Vjb25kbHksIEkga25vdyBoYXZlbid0IHdyaXR0ZW4gbXVjaA== */
module.exports = router;