const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');
const { fetchFiles } = require('../../utils/fileHelper');

router.get("/instance/:id/files", async (req, res) => {
    if (!req.user) return res.redirect('/');

    const { id } = req.params;
    if (!id) return res.redirect('../instances');

    const instance = await db.get(id + '_instance').catch(err => {
        console.error('Failed to fetch instance:', err);
        return null;
    });

    if (!instance || !instance.VolumeId) return res.redirect('../instances');

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.ContainerId);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    try {
        const files = await fetchFiles(instance, req.query.path);
        res.render('instance/files', { 
            req, 
            files, 
            user: req.user, 
            name: await db.get('name') || 'Skyport', 
            logo: await db.get('logo') || false 
        });
    } catch (error) {
        const errorMessage = error.response && error.response.data ? error.response.data.message : 'Connection to node failed.';
        res.status(500).render('500', { 
            error: errorMessage, 
            req, 
            user: req.user, 
            name: await db.get('name') || 'Skyport', 
            logo: await db.get('logo') || false 
        });
    }
});

module.exports = router;