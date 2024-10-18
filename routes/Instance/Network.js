const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer, isInstanceSuspended } = require('../../utils/authHelper');
const log = new (require('cat-loggr'))();

const { loadPlugins } = require('../../plugins/loadPls.js');
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

router.get("/instance/:id/network", async (req, res) => {
    if (!req.user) return res.redirect('/');

    const { id } = req.params;
    if (!id) return res.redirect('../instances');

    const instance = await db.get(id + '_instance').catch(err => {
        log.error('Failed to fetch instance:', err);
        return null;
    });

    if (!instance) return res.status(404).send('Instance not found');

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    const suspended = await isInstanceSuspended(req.user.userId, instance, id);
    if (suspended === true) {
        return res.render('instance/suspended', { req, user: req.user });
    }

    const allPluginData = Object.values(plugins).map(plugin => plugin.config);
    const ports = processPorts(instance.Ports, instance);

    res.render('instance/network', {
        req,
        user: req.user,
        instance,
        ports,
        
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