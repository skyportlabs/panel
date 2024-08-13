const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'tmp/' });
const FormData = require('form-data');
const fs = require('node:fs');
const axios = require('axios');
const { db } = require('../../handlers/db.js');
const { isUserAuthorizedForContainer } = require('../../utils/authHelper');

router.post("/instance/:id/files/upload", upload.array('files'), async (req, res) => {
    if (!req.user) {
        return res.status(401).send('Authentication required');
    }

    const { id } = req.params;
    const files = req.files;
    const subPath = req.query.path || '';

    if (!id || files.length === 0) {
        return res.status(400).send('No files uploaded or instance ID missing.');
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

    const apiUrl = `http://${instance.Node.address}:${instance.Node.port}/fs/${instance.VolumeId}/files/upload?path=${encodeURIComponent(subPath)}`;
    const formData = new FormData();

    files.forEach(file => {
        formData.append('files', fs.createReadStream(file.path), file.originalname);
    });

    try {
        const response = await axios.post(apiUrl, formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Basic ${Buffer.from('Skyport:' + instance.Node.apiKey).toString('base64')}`,
            }
        });
        res.json({ message: 'Files uploaded successfully', details: response.data });
    } catch (error) {
        console.error(error);
        res.status(500).send('Failed to upload files to node.');
    } finally {
        // Clean up temporary files
        files.forEach(file => fs.unlink(file.path, err => {
            if (err) console.error(`Failed to delete temporary file: ${file.path}`, err);
        }));
    }
});

module.exports = router;