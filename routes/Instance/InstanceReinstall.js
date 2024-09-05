const express = require('express');
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditlog.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');
const { v4: uuid } = require('uuid');

const router = express.Router();

/**
 * GET /instance/reinstall/:id
 * Handles the reinstallment of an existing instance based on the parameters provided via query strings.
 */
router.post('/instance/reinstall/:id', async (req, res) => {
    if (!req.user) return res.redirect('/');
    
    const { id } = req.params;

    if (!id) {
        return res.redirect('/instances');
    }

    try {
        const instance = await db.get(`${id}_instance`);
        if (!instance) {
            return res.redirect('/instances');
        }

        const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
        if (!isAuthorized) {
            return res.status(403).send('Unauthorized access to this instance.');
        }

        if(!instance.suspended) {
            instance.suspended = false;
            db.set(id + '_instance', instance);
        }
    
        if(instance.suspended === true) {
            return res.redirect('../../instance/' + id + '/suspended');
        }

        const { Node: node, imageData, Memory: memory, Cpu: cpu, Ports: ports, Name: name, User: user, Primary: primary, ContainerId: containerId, Env } = instance;
        const nodeId = node.id;

        const shortimage = instance.Image;

        if (!shortimage || !memory || !cpu || !ports || !nodeId || !name || !user || !primary) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        if (!node) {
            return res.status(400).json({ error: 'Invalid node' });
        }

        const requestData = await prepareRequestData(shortimage, memory, cpu, ports, name, node, id, containerId, Env);
        const response = await axios(requestData);

        await updateDatabaseWithNewInstance(response.data, user, node, shortimage, memory, cpu, ports, primary, name, id, Env);

        res.status(201).redirect(`../../instance/${id}`);
    } catch (error) {
        console.error('Error reinstalling instance:', error);
        res.status(500).json({
            error: 'Failed to reinstall container',
            details: error.response ? error.response.data : 'No additional error info'
        });
    }
});


async function prepareRequestData(image, memory, cpu, ports, name, node, id, containerId, Env) {
    const rawImages = await db.get('images');
    const imageData = rawImages.find(i => i.Image === image);

    const requestData = {
        method: 'post',
        url: `http://${node.address}:${node.port}/instances/reinstall/${containerId}`,
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
            AltImages: imageData ? imageData.AltImages : [],
            imageData
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

async function updateDatabaseWithNewInstance(responseData, userId, node, image, memory, cpu, ports, primary, name, id, Env) {
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
        AltImages: altImages,
        imageData,
        Env
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
