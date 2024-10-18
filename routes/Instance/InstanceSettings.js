const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer, isInstanceSuspended } = require('../../utils/authHelper');
const { loadPlugins } = require('../../plugins/loadPls.js');
const log = new (require('cat-loggr'))();
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

router.get("/instance/:id/settings", async (req, res) => {
    if (!req.user) {
        return res.redirect('/');
    }

    const { id } = req.params;
    if (!id) {
        return res.redirect('../instances');
    }

    const instance = await db.get(id + '_instance').catch(err => {
        log.error('Failed to fetch instance:', err);
        return null;
    });

    if (!instance || !instance.VolumeId) {
        // console.log(instance);
        return res.redirect('../instances');
    }

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    const suspended = await isInstanceSuspended(req.user.userId, instance, id);
    if (suspended === true) {
        return res.render('instance/suspended', { req, user: req.user });
    }

    const allPluginData = Object.values(plugins).map(plugin => plugin.config);
    res.render('instance/settings', {
        req,
        user: req.user,
        instance,
        
        addons: {
            plugins: allPluginData
        } 
    });
});


router.get("/instance/:id/change/name/:name", async (req, res) => {
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

    const trimmedName = name.trim();
    instance.Name = trimmedName;

    // Update instance in userInstances
    let userInstances = await db.get(req.user.userId + '_instances') || [];
    const userInstanceIndex = userInstances.findIndex(inst => inst.ContainerId === id);
    if (userInstanceIndex !== -1) {
        userInstances[userInstanceIndex].Name = trimmedName;
        await db.set(req.user.userId + '_instances', userInstances);
    }

    // Update instance in globalInstances
    let globalInstances = await db.get('instances') || [];
    const globalInstanceIndex = globalInstances.findIndex(inst => inst.ContainerId === id);
    if (globalInstanceIndex !== -1) {
        globalInstances[globalInstanceIndex].Name = trimmedName;
        await db.set('instances', globalInstances);
    }

    // Save the updated instance
    await db.set(id + '_instance', instance);

    res.redirect('/instance/' + id + '/settings');
});

module.exports = router;