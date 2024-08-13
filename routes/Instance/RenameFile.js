const express = require('express');
const router = express.Router();
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');

router.get("/instance/:id/files/rename/:file/:newfile", async (req, res) => {
    if (!req.user) {
        return res.redirect('/');
    }

    const { id, file, newfile } = req.params;
    if (!id || !file || !newfile) {
        return res.redirect('../instances');
    }

    const instance = await db.get(id + '_instance');
    if (!instance) {
        return res.status(404).send('Instance not found');
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

    if (!instance.VolumeId) {
        return res.redirect('../instances');
    }

    const query = req.query.path ? `?path=${req.query.path}` : '';

    if (instance.Node && instance.Node.address && instance.Node.port) {
        const requestData = {
            method: 'post',
            url: `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/files/rename/${file}/${newfile}${query}`,
            auth: {
                username: 'Skyport',
                password: instance.Node.apiKey
            },
            headers: { 
                'Content-Type': 'application/json'
            }
        };

        try {
            await axios(requestData);
            res.redirect(`/instance/${id}/files${query}`);
        } catch (error) {
            const errorMessage = error.response && error.response.data ? error.response.data.message : 'Connection to node failed.';
            res.status(500).render('500', { error: errorMessage, req, user: req.user, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
        }
    } else {
        res.status(500).send('Invalid instance node configuration');
    }
});

module.exports = router;