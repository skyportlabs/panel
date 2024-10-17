const express = require('express');
const router = express.Router();
const { isUserAuthorizedForContainer, isInstanceSuspended } = require('../../utils/authHelper');

router.post("/instance/:id/power", async (req, res) => {
    if (!req.user) return res.redirect('/');
    const { id } = req.params;
    const instance = await db.get(id + '_instance');

    if (!instance || !id) return res.redirect('../instances');

    const isAuthorized = await isUserAuthorizedForContainer(req.user.userId, instance.Id);
    if (!isAuthorized) {
        return res.status(403).send('Unauthorized access to this instance.');
    }

    const suspended = await isInstanceSuspended(req.user.userId, instance, id);
    if (suspended === true) {
        return res.render('instance/suspended', { req, user: req.user });
    }

    try {
        const response = await fetch(`http://${instance.Node.address}:${instance.Node.port}/instances/${instance.ContainerId}/stop`, {
            method: 'POST',
            auth: {
                username: 'Skyport',
                password: instance.Node.apiKey
            },
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: instance.StopCommand
            })
        });
        const data = await response.json();
        res.send(data);
    } catch (error) {
        const errorMessage = error.response && error.response.data ? error.response.data.message : 'Connection to node failed.';
        res.status(500).send(errorMessage);
    }
});

module.exports = router;