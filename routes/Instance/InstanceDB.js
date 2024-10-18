const express = require('express');
const router = express.Router();
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer, isInstanceSuspended } = require('../../utils/authHelper');
const log = new (require('cat-loggr'))();

const { loadPlugins } = require('../../plugins/loadPls.js');
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

router.get("/instance/:id/db", async (req, res) => {
    if (!req.user) {
        return res.redirect('/');
    }

    const { id } = req.params;
    if (!id) {
        return res.redirect('../../../../instances');
    }

    const instance = await db.get(id + '_instance').catch(err => {
        log.error('Failed to fetch instance:', err);
        return null;
    });

    if (!instance || !instance.VolumeId) {
        return res.redirect('../../../../instances');
    }

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    const suspended = await isInstanceSuspended(req.user.userId, instance, id);
    if (suspended === true) {
        return res.render('instance/suspended', { req, user: req.user });
    }

    if (instance.Node && instance.Node.address && instance.Node.port) {
        try {

            const allPluginData = Object.values(plugins).map(plugin => plugin.config);
            const databases = instance.Databases || [];
            const settings = await db.get('settings');
            res.render('instance/db', { 
                req,
                user: req.user, 
                databases, 
                settings,
                addons: {
                    plugins: allPluginData
                }
            });
        } catch (error) {
            const errorMessage = error.response && error.response.data ? error.response.data.message : 'Connection to node failed.';
            res.status(500).send({ message: errorMessage })
        }
    } else {
        res.status(500).send('Invalid instance node configuration');
    }
});

router.post("/instance/:id/db/create/:name", async (req, res) => {
    if (!req.user) {
        return res.status(401).send('Authentication required');
    }

    const { id, name } = req.params;

    if (!name || name.trim() === '') {
        return res.status(400).send('Name cannot be empty');
    }

    if (name.length > 50) {
        return res.status(400).send('Name cannot exceed 50 characters');
    }

    if (!/^[a-zA-Z0-9 ]+$/.test(name)) {
        return res.status(400).send('Name can only contain alphanumeric characters and spaces');
    }

    let instance = await db.get(id + '_instance');
    if (!instance) {
        return res.status(404).send('Instance not found');
    }

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    const suspended = await isInstanceSuspended(req.user.userId, instance, id);
    if (suspended === true) {
        return res.render('instance/suspended', { req, user: req.user });
    }

    if (instance.Node && instance.Node.address && instance.Node.port) {
        const requestData = {
            method: 'post',
            url: `http://${instance.Node.address}:${instance.Node.port}/database/create/${encodeURIComponent(name)}`,
            auth: {
                username: 'Skyport',
                password: instance.Node.apiKey
            },
            headers: { 
                'Content-Type': 'application/json'
            }
        };

        try {
            let response = await axios(requestData);
            
            if (response.status === 200) {
                if (!Array.isArray(instance.Databases)) {
                    instance.Databases = [];
                }

                instance.Databases.push(response.data.credentials);
                
                await db.set(id + '_instance', instance);

                return res.redirect(`/instance/${id}/db`);
            } else {
                return res.status(500).send('Failed to create database');
            }
        } catch (error) {
            const errorMessage = error.response && error.response.data && error.response.data.message 
                ? error.response.data.message 
                : 'Connection to node failed. ' + error.message;
            return res.status(500).send({ message: errorMessage });
        }
    } else {
        return res.status(500).send('Invalid instance node configuration');
    }
});

module.exports = router;