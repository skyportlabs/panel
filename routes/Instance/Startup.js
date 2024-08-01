const express = require('express');
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditlog');
const { v4: uuid } = require('uuid');
const { loadPlugins } = require('../../plugins/loadPls.js');
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));
const router = express.Router();

const allPluginData = Object.values(plugins).map(plugin => plugin.config);

/**
 * GET /instance/:id/startup
 * Renders the instance startup page with the available alternative images.
 */
router.get('/instance/:id/startup', async (req, res) => {
    const { id } = req.params;

    if (!id) {
        return res.redirect('/admin/instances');
    }

    try {
        const instance = await db.get(`${id}_instance`);
        if (!instance) {
            return res.redirect('/admin/instances');
        }

        res.render('instance/startup.ejs', {
            name: await db.get('name') || 'Skyport',
            logo: await db.get('logo') || false,
            req,
            user: req.user,
            addons: {
                plugins: allPluginData
            },
            instance
        });
    } catch (error) {
        console.error('Error fetching instance data:', error);
        res.status(500).json({
            error: 'Failed to load instance data',
            details: error.message
        });
    }
});

/**
 * GET /instances/startup/changeimage/:id
 * Handles the change of the instance image based on the parameters provided via query strings.
 */
router.get('/instances/startup/changeimage/:id', async (req, res) => {
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
        const { image, user } = req.query;

        if (!image || !user || !nodeId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const node = await db.get(`${nodeId}_node`);
        if (!node) {
            return res.status(400).json({ error: 'Invalid node' });
        }

        const requestData = await prepareRequestData(image, instance.Memory, instance.Cpu, instance.Ports, instance.Name, node, id, instance.ContainerId);
        const response = await axios(requestData);

        await updateDatabaseWithNewInstance(response.data, user, node, image, instance.Memory, instance.Cpu, instance.Ports, instance.Primary, instance.Name, id);

        logAudit(req.user.userId, req.user.username, 'instance:imageChange', req.ip);
        res.status(201).redirect(`/instance/${id}/startup`);
    } catch (error) {
        console.error('Error changing instance image:', error);
        res.status(500).json({
            error: 'Failed to change container image',
            details: error.response ? error.response.data : 'No additional error info'
        });
    }
});

async function prepareRequestData(image, memory, cpu, ports, name, node, id, containerId) {
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
            Env: imageData ? imageData.Env : undefined,
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

async function updateDatabaseWithNewInstance(responseData, userId, node, image, memory, cpu, ports, primary, name, id) {
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
        Image: image,
        AltImages: altImages
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
