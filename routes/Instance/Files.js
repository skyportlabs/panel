const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer, isInstanceSuspended } = require('../../utils/authHelper');
const { fetchFiles } = require('../../utils/fileHelper');
const log = new (require('cat-loggr'))();

const { loadPlugins } = require('../../plugins/loadPls.js');
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

router.get("/instance/:id/files", async (req, res) => {
    if (!req.user) return res.redirect('/');

    const { id } = req.params;
    if (!id) return res.redirect('../instances');

    const instance = await db.get(id + '_instance').catch(err => {
        log.error('Failed to fetch instance:', err);
        return null;
    });

    if (!instance || !instance.VolumeId) return res.redirect('../instances');

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    const suspended = await isInstanceSuspended(req.user.userId, instance, id);
    if (suspended === true) {
        return res.render('instance/suspended', { req, user: req.user });
    }

    const allPluginData = Object.values(plugins).map(plugin => plugin.config);

    try {
        const files = await fetchFiles(instance, req.query.path);
        res.render('instance/files', { 
            req, 
            user: req.user, 
            files: files, 

            addons: {
                plugins: allPluginData
            }
        });
    } catch (error) {
        const errorMessage = error.response && error.response.data ? error.response.data.message : 'Connection to node failed.';
        res.status(500).render('500', { 
            req, 
            user: req.user, 
            error: errorMessage, 

            addons: {
                plugins: allPluginData
            }
        });
    }
});

module.exports = router;