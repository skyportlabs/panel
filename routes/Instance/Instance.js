const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');
const { loadPlugins } = require('../../plugins/loadPls.js');  // Correct import
const path = require('path');
const { config } = require('process');
const { fetchFiles } = require('../../utils/fileHelper');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));  // Correct import


router.get("/instances", async (req, res) => {
    if (!req.user) return res.redirect('/');
    let instances = [];

    if (req.query.see === "other") {
        let allInstances = await db.get('instances') || [];
        instances = allInstances.filter(instance => instance.User !== req.user.userId);
    } else {
        instances = await db.get(req.user.userId + '_instances') || [];
    }


    res.render('instances', {
        req,
        instances,
        user: req.user,
        name: await db.get('name') || 'Skyport',
        logo: await db.get('logo') || false,
        config: require('../../config.json')
    });
});

router.get("/instance/:id", async (req, res) => {
    if (!req.user) return res.redirect('/');

    const { id } = req.params;
    if (!id) return res.redirect('/');

    let instance = await db.get(id + '_instance');
    if (!instance) return res.redirect('../instances');

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.ContainerId);
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

    const config = require('../../config.json');
    const { port, domain } = config;

    const allPluginData = Object.values(plugins).map(plugin => plugin.config);

    res.render('instance/instance', {
        req,
        ContainerId: instance.ContainerId,
        instance,
        port,
        domain,
        user: req.user,
        name: await db.get('name') || 'Skyport',
        logo: await db.get('logo') || false,
        files: await fetchFiles(instance, ""),
        addons: {
            plugins: allPluginData
        }
    });

    
});

module.exports = router;
