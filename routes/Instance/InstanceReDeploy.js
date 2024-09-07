const express = require('express');
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditlog');
const { v4: uuid } = require('uuid');

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
 * GET /instances/redeploy/:id
 * Handles the redeployment of an existing instance based on the parameters provided via query strings.
 */
router.get('/instances/redeploy/:id', isAdmin, async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.redirect('/admin/instances');
    }

    try {
        const instance = await db.get(`${id}_instance`);
        if (!instance) {
            return res.redirect('/admin/instances');
        }

        const nodeId = instance.Node.id;

        const {
            image,
            memory,
            cpu,
            ports,
            name,
            user,
            primary
        } = req.query;

        const shortimage = image.match(/\(([^)]+)\)/)[1];

        if (!shortimage || !memory || !cpu || !ports || !nodeId || !name || !user || !primary) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const node = await db.get(`${nodeId}_node`);
        if (!node) {
            return res.status(400).json({ error: 'Invalid node' });
        }

        const requestData = await prepareRequestData(shortimage, memory, cpu, ports, name, node, id, instance.ContainerId, instance.Env);
        const response = await axios(requestData);

        await updateDatabaseWithNewInstance(response.data, user, node, shortimage, memory, cpu, ports, primary, name, id, instance.Env, instance.imageData);

        logAudit(req.user.userId, req.user.username, 'instance:redeploy', req.ip);
        res.status(201).json({
            message: 'Container redeployed successfully and updated in user\'s servers',
            containerId: response.data.containerId,
            volumeId: response.data.volumeId
        });
    } catch (error) {
        console.error('Error redeploying instance:', error);
        res.status(500).json({
            error: 'Failed to redeploy container',
            details: error.response ? error.response.data : 'No additional error info'
        });
    }
});

async function prepareRequestData(image, memory, cpu, ports, name, node, id, containerId, Env) {
    const rawImages = await db.get('images');
    const imageData = rawImages.find(i => i.Image === image);

    const requestData = {
        method: 'post',
        url: `http://${node.address}:${node.port}/instances/redeploy/${containerId}`,
        auth: {
            username: 'Skyport',
            password: node.apiKey
        },
        headers: { 
            'Content-Type': 'application/json'
        },
        data: {
            Name: name,
            Id: id,
            Image: image,
            Env,
            Scripts: imageData ? imageData.Scripts : undefined,
            Memory: memory ? parseInt(memory) : undefined,
            Cpu: cpu ? parseInt(cpu) : undefined,
            ExposedPorts: {},
            PortBindings: {},
            AltImages: imageData ? imageData.AltImages : []
        }
    };

    if (ports) {
        ports.split(',').forEach(portMapping => {
            const [containerPort, hostPort] = portMapping.split(':');
            const key = `${containerPort}/tcp`;
            requestData.data.ExposedPorts[key] = {};
            requestData.data.PortBindings[key] = [{ HostPort: hostPort }];
        });
    }
    return requestData;
}

async function updateDatabaseWithNewInstance(responseData, userId, node, image, memory, cpu, ports, primary, name, id, Env, imagedata) {
    const rawImages = await db.get('images');
    const imageData = rawImages.find(i => i.Image === image);
    const altImages = imageData ? imageData.AltImages : [];

    const instanceData = {
        Name: name,
        Id: id,
        Node: node,
        User: userId,
        ContainerId: responseData.containerId,
        VolumeId: id,
        Memory: parseInt(memory),
        Cpu: parseInt(cpu),
        Ports: ports,
        Primary: primary,
        Env,
        Image: image,
        AltImages: altImages,
        imageData: imagedata
    };

    let userInstances = await db.get(`${userId}_instances`) || [];
    userInstances = userInstances.filter(instance => instance.Id !== id);
    userInstances.push(instanceData);
    await db.set(`${userId}_instances`, userInstances);

    let globalInstances = await db.get('instances') || [];
    globalInstances = globalInstances.filter(instance => instance.Id !== id);
    globalInstances.push(instanceData);
    await db.set('instances', globalInstances);

    await db.set(`${id}_instance`, instanceData);
}

module.exports = router;
