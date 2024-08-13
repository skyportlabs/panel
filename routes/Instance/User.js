const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');
const { loadPlugins } = require('../../plugins/loadPls.js');  // Correct import
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

router.get('/instance/:id/users', async (req, res) => {
    const { id } = req.params;

    try {
        const instance = await db.get(`${id}_instance`);
        if (!instance) {
            return res.status(404).send('Instance not found.');
        }

        const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
        if (!isAuthorized) {
            return res.status(403).send('Unauthorized access to this instance.');
        }

        let users = await db.get('users') || [];
        users = users.filter(user => user && user.accessTo && user.accessTo.includes(instance.Id));
        const instanceName = instance.Name;
        const allPluginData = Object.values(plugins).map(plugin => plugin.config);

        res.render('instance/users', { req, users, user: req.user, instance_name: instanceName, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false, addons: {
            plugins: allPluginData
        } });
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).send('Internal Server Error.');
    }
});

router.post('/instance/:id/users/add', async (req, res) => {
    const { id } = req.params;
    const { username } = req.body;

    try {
        let usersData = await db.get('users');
        if (typeof usersData !== 'object') {
            throw new Error('Users data is not in the expected format.');
        }
        let user = usersData.find(user => user.username === username);

        if (!user) {
            return res.redirect('/instance/' + id + '/users?err=usernotfound.');
        }
        if (!user.accessTo.includes(id)) {
            user.accessTo.push(id);
        }
        await db.set('users', usersData);
        return res.redirect('/instance/' + id + '/users');
    } catch (error) {
        console.error('Error updating user access:', error);
        return res.status(500).send('Internal Server Error');
    }
});

router.get('/instance/:id/users/remove/:username', async (req, res) => {
    const { id } = req.params;
    const { username } = req.params;

    try {
        let usersData = await db.get('users');
        if (typeof usersData !== 'object') {
            throw new Error('Users data is not in the expected format.');
        }
        let user = usersData.find(user => user.username === username);

        if (!user) {
            return res.redirect(`/instance/${id}/users?err=usernotfound.`);
        }
        user.accessTo = user.accessTo.filter(accessId => accessId !== id);

        await db.set('users', usersData);

        return res.redirect(`/instance/${id}/users`);
    } catch (error) {
        console.error('Error updating user access:', error);
        return res.status(500).send('Internal Server Error');
    }
});

module.exports = router;
