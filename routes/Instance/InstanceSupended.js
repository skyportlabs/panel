const express = require('express');
const router = express.Router();
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');
const log = new (require('cat-loggr'))();

router.get("/instance/:id/suspended", async (req, res) => {
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
        return res.redirect('../instances');
    }

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    if (!instance.suspended) {
        instance.suspended = false;
        db.set(id + '_instance', instance);
    }

    if (instance.suspended === false) {
        return res.redirect('../instance/' + id);
    }

    res.render('instance/suspended', {
        req,
        user: req.user
    });
});

module.exports = router;