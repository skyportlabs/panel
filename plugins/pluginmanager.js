const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { db, userdb } = require('../handlers/db.js');

const pluginList = [];
const pluginNames = [];
const pluginsidebar = {};

const pluginsDir = path.join(__dirname, '../plugins');
const pluginsJsonPath = path.join(pluginsDir, 'plugins.json');

function readpluginsJson() {
    try {
        const pluginsJson = fs.readFileSync(pluginsJsonPath, 'utf8');
        return JSON.parse(pluginsJson);
    } catch (error) {
        console.error('Error reading plugins.json:', error);
        return {};
    }
}

function writepluginsJson(plugins) {
    try {
        fs.writeFileSync(pluginsJsonPath, JSON.stringify(plugins, null, 4), 'utf8');
    } catch (error) {
        console.error('Error writing plugins.json:', error);
    }
}

function loadAndActivateplugins() {
    const pluginsJson = readpluginsJson();

    fs.readdirSync(pluginsDir).forEach(pluginName => {
        const pluginPath = path.join(pluginsDir, pluginName).replace(/\\/g, '/');
        const manifestPath = path.join(pluginPath, 'manifest.json').replace(/\\/g, '/');

        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = require(manifestPath);
                pluginList.push(manifest);
                pluginNames.push(manifest.name);
                console.log(`Loaded plugin: ${manifest.name}`);
                
                if (pluginsJson[pluginName] === undefined || pluginsJson[pluginName].enabled) {
                    const mainFilePath = path.join(pluginPath, manifest.main).replace(/\\/g, '/');
                    const pluginModule = require(mainFilePath);
                    
                    if (typeof pluginModule.register === 'function') {
                        pluginModule.register(global.pluginmanager);
                    } else {
                        console.log(`Error: plugin ${manifest.name} has no 'register' function.`);
                    }

                    if (pluginModule.router) {
                        router.use(`/${manifest.router}`, pluginModule.router);
                        console.log(`Routes for plugin ${manifest.name} added.`);
                    } else {
                        console.log(`Error: plugin ${manifest.name} has no 'router' property.`);
                    }

                    if (manifest.adminsidebar) {
                        Object.keys(manifest.adminsidebar).forEach(key => {
                            pluginsidebar[key] = manifest.adminsidebar[key];
                        });
                    }
                } else {
                    console.log(`plugin ${manifest.name} is disabled.`);
                    const index = pluginNames.indexOf(manifest.name);
                    if (index !== -1) {
                        pluginNames.splice(index, 1);
                    }
                }
            } catch (error) {
                console.error(`Error loading plugin ${pluginName}: ${error}`);
            }
        }
    });

    console.log('Loaded plugins:', pluginNames);

    const pluginsInJson = Object.keys(pluginsJson);
    pluginNames.forEach(pluginName => {
        if (!pluginsInJson.includes(pluginName)) {
            pluginsJson[pluginName] = { enabled: true };
        }
    });
    writepluginsJson(pluginsJson);
}

function isAdmin(req, res, next) {
    if (!req.user || req.user.admin !== true) {
        return res.redirect('../../../');
    }
    next();
}

router.get('/admin/plugins', isAdmin, async (req, res) => {
    const settings = await db.get('settings');
    res.render('admin/plugins', { plugins: pluginList, pluginsidebar, user: req.user, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
});

loadAndActivateplugins();

module.exports = router;
