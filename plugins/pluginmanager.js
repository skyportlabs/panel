const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();
const { db, userdb } = require('../handlers/db.js');
const CatLoggr = require('cat-loggr');
const log = new CatLoggr();

let pluginList = [];
let pluginNames = [];
let pluginsidebar = {};
let sidebar = {};

const pluginsDir = path.join(__dirname, '../plugins');
const pluginsJsonPath = path.join(pluginsDir, 'plugins.json');

async function readPluginsJson() {
    try {
        const pluginsJson = await fs.promises.readFile(pluginsJsonPath, 'utf8');
        return JSON.parse(pluginsJson);
    } catch (error) {
        log.error('Error reading plugins.json:', error);
        return {};
    }
}

async function writePluginsJson(plugins) {
    try {
        await fs.promises.writeFile(pluginsJsonPath, JSON.stringify(plugins, null, 4), 'utf8');
    } catch (error) {
        log.error('Error writing plugins.json:', error);
    }
}


async function loadAndActivatePlugins() {
    pluginList = [];
    pluginNames = [];
    pluginsidebar = {};
    sidebar = {};

    Object.keys(require.cache).forEach(key => {
        if (key.startsWith(pluginsDir)) {
            delete require.cache[key];
        }
    });

    let pluginsJson = await readPluginsJson();
    const pluginDirs = await fs.promises.readdir(pluginsDir);

    for (const pluginName of pluginDirs) {
        const pluginPath = path.join(pluginsDir, pluginName);
        const manifestPath = path.join(pluginPath, 'manifest.json');

        if (fs.existsSync(manifestPath)) {
            const manifest = require(manifestPath);
            if (!pluginsJson[manifest.name]) {
                pluginsJson[manifest.name] = { enabled: true };
            }
        }
    }

    await writePluginsJson(pluginsJson);

    for (const pluginName of pluginDirs) {
        const pluginPath = path.join(pluginsDir, pluginName);
        const manifestPath = path.join(pluginPath, 'manifest.json');

        if (fs.existsSync(manifestPath)) {
            const manifest = require(manifestPath);
            try {
                const pluginConfig = pluginsJson[manifest.name];
                if (!pluginConfig.enabled) {
                    log.info(`Plugin ${pluginName} is disabled.`);
                    pluginList.push(manifest);
                    continue;
                }
                manifest.directoryname = pluginName;
                manifest.manifestpath = manifestPath;
                pluginList.push(manifest);
                pluginNames.push(manifest.name);
                log.init(`Loaded plugin: ${manifest.name}`);

                const mainFilePath = path.join(pluginPath, manifest.main);
                const pluginModule = require(mainFilePath);

                if (typeof pluginModule.register === 'function') {
                    pluginModule.register(global.pluginmanager);
                } else {
                    log.error(`Error: plugin ${manifest.name} has no 'register' function.`);
                }

                if (pluginModule.router) {
                    router.use(`/${manifest.router}`, pluginModule.router);
                    log.init(`Routes for plugin ${manifest.name} added`);
                } else {
                    log.error(`Error: plugin ${manifest.name} has no 'router' property.`);
                }

                if (manifest.adminsidebar) {
                    Object.assign(pluginsidebar, manifest.adminsidebar);
                    Object.assign(sidebar, manifest.sidebar);
                }
            } catch (error) {
                log.error(`Error loading plugin ${pluginName}:`, error);
            }
        }
    }
}

function isAdmin(req, res, next) {
    if (!req.user || req.user.admin !== true) {
        return res.redirect('../');
    }
    next();
}

router.get('/admin/plugins', isAdmin, async (req, res) => {
    const pluginsJson = await readPluginsJson();

    const pluginArray = Object.entries(pluginsJson).map(([name, details]) => ({
        name,
        ...details
    }));

    const enabledPlugins = pluginArray.filter(plugin => plugin.enabled);

    res.render('admin/plugins', {
        req,
        plugins: pluginList,
        pluginsidebar,
        enabledPlugins,
        user: req.user,
        name: await db.get('name') || 'Skyport',
        logo: await db.get('logo') || false
    });
});

router.post('/admin/plugins/:name/toggle', isAdmin, async (req, res) => {
    const name = req.params.name;
    const pluginsJson = await readPluginsJson();

    if (pluginsJson[name]) {
        pluginsJson[name].enabled = !pluginsJson[name].enabled;
        await writePluginsJson(pluginsJson);
        await loadAndActivatePlugins();
    }
    res.send('OK');
});

router.get('/admin/plugins/:dir/edit', isAdmin, async (req, res) => {
    const dir = req.params.dir;
    const manifestPath = path.join(__dirname, dir, 'manifest.json');
    const manifestJson = await fs.promises.readFile(manifestPath, 'utf8');

    res.render('admin/plugin', {
        req,
        pluginsidebar,
        dir,
        content: manifestJson,
        user: req.user,
        name: await db.get('name') || 'Skyport',
        logo: await db.get('logo') || false
    });
});

router.post('/admin/plugins/:dir/save', isAdmin, async (req, res) => {
    const dir = req.params.dir;
    const content = req.body.content;
    const manifestPath = path.join(__dirname, dir, 'manifest.json');

    await fs.promises.writeFile(manifestPath, content, 'utf8');
    res.redirect(`/admin/plugins/${dir}/edit`);
});

router.post('/admin/plugins/reload', isAdmin, async (req, res) => {
    await loadAndActivatePlugins();
    res.redirect('/admin/plugins');
});

loadAndActivatePlugins();

module.exports = router;
