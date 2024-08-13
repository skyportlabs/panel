const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');
const axios = require('axios');

const { loadPlugins } = require('../../plugins/loadPls.js');  // Correct import
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

router.get("/instance/:id/files/folder/create", async (req, res) => {
    if (!req.user) {
        return res.redirect('/');
    }

    const { id } = req.params;
    if (!id) {
        return res.redirect('../instances');
    }

    const instance = await db.get(id + '_instance');
    if (!instance) {
        return res.status(404).send('Instance not found');
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

    if (!instance || !instance.VolumeId) {
        return res.redirect('../instances');
    }

    const allPluginData = Object.values(plugins).map(plugin => plugin.config);

    res.render('instance/createFolder', { req, user: req.user, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false, addons: {
        plugins: allPluginData
    } });
});

router.post("/instance/:id/files/folder/create/:foldername", async (req, res) => {
    if (!req.user) {
        return res.status(401).send('Authentication required');
    }

    const { id, foldername } = req.params;

    const instance = await db.get(id + '_instance');
    if (!instance) {
        return res.status(404).send('Instance not found');
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

    if (!instance.Node || !instance.Node.address || !instance.Node.port) {
        return res.status(500).send('Invalid instance node configuration');
    }

    const query = req.query.path ? `?path=${req.query.path}` : '';
    const apiUrl = `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/folders/create/${foldername}${query}`;

    try {
        const response = await axios.post(apiUrl, {}, {
            auth: {
                username: 'Skyport',
                password: instance.Node.apiKey
            },
            headers: { 'Content-Type': 'application/json' }
        });
        res.json(response.data);
    } catch (error) {
        if (error.response) {
            res.status(error.response.status).send(error.response.data);
        } else {
            res.status(500).send({ message: 'Failed to communicate with node.' });
        }
    }
});

module.exports = router;