const express = require('express');
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { logAudit } = require('../../handlers/auditLog.js');
const log = new (require('cat-loggr'))();
const { loadPlugins } = require('../../plugins/loadPls.js');
const { isUserAuthorizedForContainer, isInstanceSuspended } = require('../../utils/authHelper');
const path = require('path');

const { checkContainerState } = require('../../utils/checkstate.js');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));
const router = express.Router();

const allPluginData = Object.values(plugins).map(plugin => plugin.config);

/**
 * GET /instance/:id/startup
 * Renders the instance startup page with the available alternative images.
 */
router.get('/instance/:id/startup', async (req, res) => {
    if (!req.user) return res.redirect('/');

    const { id } = req.params;

    if (!id) {
        return res.redirect('/instances');
    }

    try {
        const instance = await db.get(`${id}_instance`);
        if (!instance) {
            return res.redirect('../../instances');
        }

        const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
        if (!isAuthorized) {
            return res.status(403).send('Unauthorized access to this instance.');
        }

        const suspended = await isInstanceSuspended(req.user.userId, instance, id);
        if (suspended === true) {
            return res.render('instance/suspended', { req, user: req.user });
        }

        res.render('instance/startup.ejs', {
            req,
            user: req.user,
            instance,
            
            addons: {
                plugins: allPluginData
            }
        });
    } catch (error) {
        log.error('Error fetching instance data:', error);
        res.status(500).json({
            error: 'Failed to load instance data',
            details: error.message
        });
    }
});

/**
 * POST /instances/startup/changevariable/:id
 * Handles the change of a specific environment variable for the instance.
 */
router.post('/instances/startup/changevariable/:id', async (req, res) => {
    if (!req.user) return res.redirect('/');

    const { id } = req.params;
    const { variable, value, user } = req.query;

    if (!id || !variable || !user) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        const instance = await db.get(`${id}_instance`);
        if (!instance) {
            return res.status(404).json({ error: 'Instance not found' });
        }

        const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
        if (!isAuthorized) {
            return res.status(403).send('Unauthorized access to this instance.');
        }

        const suspended = await isInstanceSuspended(req.user.userId, instance, id);
        if (suspended === true) {
            return res.render('instance/suspended', { req, user: req.user });
        }

        const updatedEnv = instance.Env.map(envVar => {
            const [key] = envVar.split('=');
            return key === variable ? `${key}=${value}` : envVar;
        });
        const updatedInstance = { ...instance, Env: updatedEnv };
        await db.set(`${id}_instance`, updatedInstance);

        logAudit(req.user.userId, req.user.username, 'instance:variableChange', req.ip);
        res.json({ success: true });
    } catch (error) {
        log.error('Error updating environment variable:', error);
        res.status(500).json({
            error: 'Failed to update environment variable',
            details: error.message
        });
    }
});

/**
 * GET /instances/startup/changeimage/:id
 * Handles the change of the instance image based on the parameters provided via query strings.
 */
router.get('/instances/startup/changeimage/:id', async (req, res) => {
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

        const suspended = await isInstanceSuspended(req.user.userId, instance, id);
        if (suspended === true) {
            return res.render('instance/suspended', { req, user: req.user });
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

        const requestData = await prepareRequestData(image, instance.Memory, instance.Cpu, instance.Ports, instance.Name, node, id, instance.ContainerId, instance.Env);
        const response = await axios(requestData);

        await updateDatabaseWithNewInstance(response.data, user, node, instance.imageData.Image, instance.Memory, instance.Cpu, instance.Ports, instance.Primary, instance.Name, id, image, instance.imageData, instance.Env);

        checkContainerState(id, node.address, node.port, node.apiKey, user);
        logAudit(req.user.userId, req.user.username, 'instance:imageChange', req.ip);
        res.status(201).redirect(`/instance/${id}/startup`);
    } catch (error) {
        log.error('Error changing instance image:', error);
        res.status(500).json({
            error: 'Failed to change container image',
            details: error.response ? error.response.data : 'No additional error info'
        });
    }
});

async function prepareRequestData(image, memory, cpu, ports, name, node, id, containerId, Env) {
    const rawImages = await db.get('images');
    const imageData = rawImages.find(i => i.Image === image);

    const requestData = {
        method: 'post',
        url: `http://${node.address}:${node.port}/instances/redeploy/${containerId}/${id}`,
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

async function updateDatabaseWithNewInstance(responseData, userId, node, image, memory, cpu, ports, primary, name, id, currentimage, imagedata, Env) {
    const rawImages = await db.get('images');
    const imageData = rawImages.find(i => i.Image === image);
    const altImages = imageData ? imageData.AltImages : [];

    const instanceData = {
        Name: name,
        Id: id,
        Node: node,
        User: userId,
        InternalState: 'INSTALLING',
        ContainerId: responseData.containerId,
        VolumeId: id,
        Memory: parseInt(memory),
        Cpu: parseInt(cpu),
        Ports: ports,
        Primary: primary,
        currentimage,
        Env,
        Image: image,
        AltImages: altImages,
        imageData: imagedata,
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