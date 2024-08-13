const express = require('express');
const router = express.Router();
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');
const { loadPlugins } = require('../../plugins/loadPls.js');  // Korrekte Importierung
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

/**
 * GET /instance/:id/archives
 * Lists all archives for a specific instance and renders them on an EJS page.
 */
router.get("/instance/:id/archives", async (req, res) => {
    if (!req.user) {
        return res.redirect('/');
    }

    const { id } = req.params;
    if (!id) {
        return res.redirect('/instances');
    }

    try {
        const instance = await db.get(`${id}_instance`);

        if (!instance || !instance.ContainerId) {
            return res.redirect('/instances');
        }

        const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
        if (!isAuthorized) {
            return res.status(403).send('Unauthorized access to this instance.');
        }

        if (instance.Node && instance.Node.address && instance.Node.port) {
            const RequestData = {
                method: 'get',
                url: `http://${instance.Node.address}:${instance.Node.port}/archive/${instance.ContainerId}/archives`,
                auth: {
                    username: 'Skyport',
                    password: instance.Node.apiKey
                },
                headers: { 
                    'Content-Type': 'application/json'
                }
            };

            try {
                const response = await axios(RequestData);
                const archives = response.data.archives || [];

                const allPluginData = Object.values(plugins).map(plugin => plugin.config);
                const settings = await db.get('settings');
                const name = await db.get('name') || 'Skyport';
                const logo = await db.get('logo') || false;

                res.render('instance/archives', { 
                    req, 
                    archives, 
                    user: req.user, 
                    instance_name: instance.Name, 
                    name, 
                    logo, 
                    addons: {
                        plugins: allPluginData
                    },
                    settings 
                });
            } catch (error) {
                const errorMessage = error.response?.data?.message || 'Connection to node failed.';
                console.error('Error fetching archives from node:', errorMessage);
                res.status(500).send({ message: errorMessage });
            }
        } else {
            res.status(500).send('Invalid instance node configuration');
        }
    } catch (err) {
        console.error('Error fetching instance or settings:', err);
        res.status(500).send('Server error');
    }
});


router.post('/instance/:id/archives/create', async (req, res) => {
    console.log(req.body);
    const { id } = req.params;
    if (!req.user) {
        return res.redirect('/');
    }

    const instance = await db.get(`${id}_instance`);

    if (!id) {
        return res.redirect('/instances');
    }

    if (!instance || !instance.ContainerId) {
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

    const RequestData = {
        method: 'post',
       // url: `http://${instance.Node.address}:${instance.Node.port}/archive/${instance.ContainerId}/archives`,
        url: `http://Skyport:${instance.Node.apiKey}@${instance.Node.address}:${instance.Node.port}/archive/${instance.ContainerId}/archives/${instance.VolumeId}/create`,
        headers: { 
            'Content-Type': 'application/json'
        }
    };

    const response = await axios(RequestData);
    if (response.status === 200) {
        res.redirect('/instance/' + id + '/archives');
    } else {
        res.status(500).send('Failed to create archive');
    }

});


router.post('/instance/:id/archives/delete/:archivename', async (req, res) => {
    console.log(req.body);
    const { id, archivename } = req.params;
    if (!req.user) {
        return res.redirect('/');
    }

    const instance = await db.get(`${id}_instance`);

    if (!id) {
        return res.redirect('/instances');
    }

    if (!instance || !instance.ContainerId) {
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

    const RequestData = {
        method: 'post',
       // url: `http://${instance.Node.address}:${instance.Node.port}/archive/${instance.ContainerId}/archives`,
        url: `http://Skyport:${instance.Node.apiKey}@${instance.Node.address}:${instance.Node.port}/archive/${instance.ContainerId}/archives/delete/${archivename}`,
        headers: { 
            'Content-Type': 'application/json'
        }
    };

    const response = await axios(RequestData);
    if (response.status === 200) {
        res.redirect('/instance/' + id + '/archives1');
    } else {
        res.status(500).send('Failed to create archive');
    }

});




router.post('/instance/:id/archives/rollback/:archivename', async (req, res) => {
    console.log(req.body);
    const { id, archivename } = req.params;
    if (!req.user) {
        return res.redirect('/');
    }

    const instance = await db.get(`${id}_instance`);

    if (!id) {
        return res.redirect('/instances');
    }

    if (!instance || !instance.ContainerId) {
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

    const RequestData = {
        method: 'post',
       // url: `http://${instance.Node.address}:${instance.Node.port}/archive/${instance.ContainerId}/archives`,
        url: `http://Skyport:${instance.Node.apiKey}@${instance.Node.address}:${instance.Node.port}/archive/${instance.ContainerId}/archives/rollback/${instance.VolumeId}/${archivename}`,
        headers: { 
            'Content-Type': 'application/json'
        }
    };

    const response = await axios(RequestData);
    if (response.status === 200) {
        res.redirect('/instance/' + id + '/archives');
    } else {
        res.status(500).send('Failed to create archive');
    }

});


module.exports = router;
