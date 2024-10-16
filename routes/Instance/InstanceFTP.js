const express = require('express');
const router = express.Router();
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer, isInstanceSuspended } = require('../../utils/authHelper');
const log = new (require('cat-loggr'))();

const { loadPlugins } = require('../../plugins/loadPls.js');
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

router.get("/instance/:id/ftp", async (req, res) => {
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
        const RequestData = {
            method: 'get',
            url: `http://${instance.Node.address}:${instance.Node.port}/ftp/info/${instance.VolumeId}`,
            auth: {
                username: 'Skyport',
                password: instance.Node.apiKey
            },
            headers: { 
                'Content-Type': 'application/json'
            }
        };

        try {
            const allPluginData = Object.values(plugins).map(plugin => plugin.config);
            const response = await axios(RequestData);
            const loginData = response.data || [];

            const settings = await db.get('settings');
            res.render('instance/ftp', { 
                req, 
                user: req.user, 
                loginData, 
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

module.exports = router;