const express = require('express');
const fs = require('fs').promises;
const router = express.Router();

const { isAuthenticated } = require('../handlers/auth.js');
const { db } = require('../handlers/db.js');

// Asynchronously read the JSON file and setup routes
async function setupRoutes() {
    try {
        const data = await fs.readFile('pages.json', 'utf8'); 
        const pages = JSON.parse(data);

        pages.forEach(async page => {
            if (page.requiresAuth) {
                router.get(page.path, isAuthenticated, async (req, res) => {
                    const instances = await db.get(req.user.userId + '_instances') || [];
                    res.render(page.template, { req, user: req.user, instances, name: await db.get('name') || 'Skyport' });
                });
            } else {
                router.get(page.path, async (req, res) => {
                    res.render(page.template, { req, name: await db.get('name') || 'Skyport' });
                });
            }
        });
    } catch (error) {
        console.error('Error setting up routes:', error);
    }
}

router.get('/', async (req, res) => {
    res.redirect('../instances')
});

// Setup routes
setupRoutes();

module.exports = router;
