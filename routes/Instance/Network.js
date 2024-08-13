const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');

const { loadPlugins } = require('../../plugins/loadPls.js');  // Correct import
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

router.get("/instance/:id/network", async (req, res) => {
    if (!req.user) return res.redirect('/');

    const { id } = req.params;
    if (!id) return res.redirect('../instances');

    const instance = await db.get(id + '_instance').catch(err => {
        console.error('Failed to fetch instance:', err);
        return null;
    });

    if (!instance) return res.status(404).send('Instance not found');

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

    const allPluginData = Object.values(plugins).map(plugin => plugin.config);
    const ports = processPorts(instance.Ports, instance);

    res.render('instance/network', {
        req,
        instance,
        ports,
        user: req.user,
        name: await db.get('name') || 'Skyport',
        logo: await db.get('logo') || false,
        addons: {
            plugins: allPluginData
        }
    });
});

function processPorts(portsString, instance) {
    if (!portsString) return [];
    
    return portsString.split(',').map(mapping => {
        const [external, internal] = mapping.split(':');
        return {
            port: parseInt(external),
            primary: instance.Primary === external,
            internal: parseInt(internal)
        };
    });
}

module.exports = router;