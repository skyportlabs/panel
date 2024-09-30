const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');
const { fetchFileContent } = require('../../utils/fileHelper');
const log = new (require('cat-loggr'))();

const { loadPlugins } = require('../../plugins/loadPls.js');
const path = require('path');

const plugins = loadPlugins(path.join(__dirname, '../../plugins'));

router.get("/instance/:id/files/view/:file", async (req, res) => {
    if (!req.user) return res.redirect('/');

    const { id, file } = req.params;
    if (!id || !file) return res.redirect('../instances');

    const instance = await db.get(id + '_instance').catch(err => {
        log.error('Failed to fetch instance:', err);
        return null;
    });

    if (!instance || !instance.VolumeId) return res.redirect('../instances');

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    if (!instance.suspended) {
        instance.suspended = false;
        db.set(id + '_instance', instance);
    }

    if (instance.suspended === true) {
        return res.redirect('../../instance/' + id + '/suspended');
    }

    const allPluginData = Object.values(plugins).map(plugin => plugin.config);


    try {
        
        const fileContent = await fetchFileContent(instance, file, req.query.path);
        res.render('instance/file', { 
            req, 
            file: fileContent, 
            user: req.user, 

            addons: {
                plugins: allPluginData
            }
        });
    } catch (error) {
        const errorMessage = error.response && error.response.data ? error.response.data.message : 'Connection to node failed.';
        res.status(500).render('500', { 
            error: errorMessage, 
            req, 
            user: req.user, 

            addons: {
                plugins: allPluginData
            }
        });
    }
});

module.exports = router;