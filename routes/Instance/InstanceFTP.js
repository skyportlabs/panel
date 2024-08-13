const express = require('express');
const router = express.Router();
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');

const { loadPlugins } = require('../../plugins/loadPls.js');  // Correct import
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
        console.error('Failed to fetch instance:', err);
        return null;
    });

    if (!instance || !instance.VolumeId) {
        return res.redirect('../../../../instances');
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
            const logindata = response.data || [];

            const settings = await db.get('settings');
            res.render('instance/ftp', { 
                req, 
                logindata, 
                user: req.user, 
                instance_name: instance.Name, 
                name: await db.get('name') || 'Skyport', 
                logo: await db.get('logo') || false, 
                addons: {
                    plugins: allPluginData
                },
                settings 
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