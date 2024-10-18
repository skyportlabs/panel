const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const log = new (require('cat-loggr'))();
const { isAdmin } = require('../utils/isAdmin');

const router = express.Router();
let pluginList = [];
let pluginSidebar = {};

const pluginsDir = path.join(__dirname, '../plugins');
const pluginsJsonPath = path.join(pluginsDir, 'plugins.json');

let isLoadingPlugins = false;

async function readPluginsJson() {
    try {
        const pluginsJson = await fs.promises.readFile(pluginsJsonPath, 'utf8');
        if (!pluginsJson.trim()) {
            log.error('Error: plugins.json is empty.');
            return {};
        }
        const parsed = JSON.parse(pluginsJson);
        return parsed;
    } catch (error) {
        if (error instanceof SyntaxError) {
            log.error('SyntaxError in plugins.json:', error.message);
        } else {
            log.error('Error reading plugins.json:', error.message);
        }
        return {};
    }
}

async function writePluginsJson(plugins) {
    try {
        const tempPath = pluginsJsonPath + '.tmp';
        await fs.promises.writeFile(tempPath, JSON.stringify(plugins, null, 4), 'utf8');
        await fs.promises.rename(tempPath, pluginsJsonPath);
        log.info('plugins.json successfully written.');
    } catch (error) {
        log.error('Error writing plugins.json:', error.message);
    }
}

async function checkAndInstallModule(moduleName) {
    return new Promise((resolve, reject) => {
        exec(`npm install ${moduleName}`, (error, stdout, stderr) => {
            if (error) {
                log.error(`Error installing module ${moduleName}: ${stderr}`);
                reject(new Error(`Could not install ${moduleName}.`));
            } else {
                log.info(`Successfully installed module ${moduleName}.`);
                resolve();
            }
        });
    });
}

async function validatePlugin(pluginPath, manifest) {
    const errors = [];

    const mainFilePath = path.join(pluginPath, manifest.main);
    if (!fs.existsSync(mainFilePath)) {
        errors.push(`Main file '${manifest.main}' not found in '${pluginPath}'.`);
    }

    try {
        require(mainFilePath);
    } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
            const moduleName = error.message.split(' ')[1];
            log.warn(`Module not found for plugin '${manifest.name}' in '${pluginPath}'. Attempting to install '${moduleName}'...`);
            try {
                await checkAndInstallModule(moduleName);
            } catch (installError) {
                errors.push(`Failed to install module '${moduleName}' for plugin '${manifest.name}'.`);
            }
        } else {
            errors.push(`Error loading main file for plugin '${manifest.name}': ${error.message} in '${pluginPath}'.`);
        }
    }

    return errors;
}

async function loadAndActivatePlugins() {
    if (isLoadingPlugins) {
        log.warn('loadAndActivatePlugins is already running.');
        return;
    }
    isLoadingPlugins = true;

    try {
        pluginList = [];
        pluginSidebar = {};
        const errors = [];

        Object.keys(require.cache).forEach(key => {
            if (key.startsWith(pluginsDir)) {
                delete require.cache[key];
            }
        });

        let pluginsJson = await readPluginsJson();
        const pluginDirs = await fs.promises.readdir(pluginsDir);

        log.info('Loading plugins...');

        for (const pluginName of pluginDirs) {
            const pluginPath = path.join(pluginsDir, pluginName);
            const manifestPath = path.join(pluginPath, 'manifest.json');

            const isDirectory = fs.statSync(pluginPath).isDirectory();
            if (!isDirectory) continue;

            if (!fs.existsSync(manifestPath)) {
                log.warn(`Manifest file does not exist for plugin '${pluginName}'.`);
                continue;
            }

            let manifest;
            try {
                const manifestContent = fs.readFileSync(manifestPath, 'utf8');
                manifest = JSON.parse(manifestContent);
                
                if (!pluginsJson[manifest.name]) {
                    pluginsJson[manifest.name] = { enabled: true };
                }
            } catch (error) {
                log.error(`Error loading manifest for plugin '${pluginName}': ${error.message}.`);
                errors.push(`Manifest error: ${error.message}`);
                continue;
            }

            const pluginConfig = pluginsJson[manifest.name];

            log.info(`Loading plugin '${pluginName}', enabled: ${pluginConfig.enabled}`);

            const validationErrors = await validatePlugin(pluginPath, manifest);
            if (validationErrors.length > 0) {
                validationErrors.forEach(err => log.error(`Validation error in plugin '${pluginName}': ${err}`));
                log.error(`Plugin '${pluginName}' has validation errors but will still be listed.`);
                pluginConfig.enabled = false;
                errors.push(`Validation errors in '${pluginName}'`);
            }

            manifest.directoryname = pluginName;
            manifest.manifestpath = manifestPath;
            pluginList.push(manifest);

            let pluginModule;

            try {
                pluginModule = require(path.join(pluginPath, manifest.main));
                if (typeof pluginModule.register === 'function') {
                    pluginModule.register(global.pluginManager);
                }

                if (pluginModule.router && typeof pluginModule.router === 'function') {
                    router.use(`/${manifest.router}`, pluginModule.router);
                } else {
                    log.error(`Router for plugin '${pluginName}' is not a valid middleware function.`);
                }

                if (manifest.adminsidebar) {
                    Object.assign(pluginSidebar, manifest.adminsidebar);
                }

            } catch (error) {
                log.error(`Error loading plugin '${pluginName}': ${error.message}.`);
                pluginConfig.enabled = false; 
                errors.push(`Loading error in '${pluginName}': ${error.message}`);
            }
        }

        await writePluginsJson(pluginsJson);

        if (errors.length > 0) {
            log.error(`Errors occurred while loading plugins: ${errors.join(', ')}`);
        }
    } finally {
        isLoadingPlugins = false;
    }
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
        user: req.user,
        plugins: pluginList,
        pluginSidebar,
        enabledPlugins,
    });
});

router.post('/admin/plugins/:name/toggle', isAdmin, async (req, res) => {
    try {
        const name = req.params.name;
        const pluginsJson = await readPluginsJson();

        if (pluginsJson[name]) {
            pluginsJson[name].enabled = !pluginsJson[name].enabled;
            await writePluginsJson(pluginsJson);
            await loadAndActivatePlugins();
        }
        res.send('OK');
    } catch (error) {
        log.error(`Error toggling plugin ${name}: ${error.message}`);
        res.status(500).send('An error occurred. Please try again later.');
    }
});

router.get('/admin/plugins/:dir/edit', isAdmin, async (req, res) => {
    try {
        const dir = req.params.dir;
        const manifestPath = path.join(pluginsDir, dir, 'manifest.json');
        const manifestJson = await fs.promises.readFile(manifestPath, 'utf8');

        res.render('admin/plugin', {
            req,
            user: req.user,
            pluginSidebar,
            dir,
            content: manifestJson,
        });
    } catch (error) {
        log.error(`Error loading plugin edit page: ${error.message}`);
        res.status(500).send('An error occurred. Please try again later.');
    }
});

router.post('/admin/plugins/:dir/save', isAdmin, async (req, res) => {
    try {
        const dir = req.params.dir;
        const content = req.body.content;
        const manifestPath = path.join(pluginsDir, dir, 'manifest.json');

        await fs.promises.writeFile(manifestPath, content, 'utf8');
        res.redirect(`/admin/plugins/${dir}/edit`);
    } catch (error) {
        log.error(`Error saving plugin ${dir}: ${error.message}`);
        res.status(500).send('An error occurred. Please try again later.');
    }
});

router.post('/admin/plugins/reload', isAdmin, async (req, res) => {
    try {
        await loadAndActivatePlugins();
        res.redirect('/admin/plugins');
    } catch (error) {
        log.error(`Error reloading plugins: ${error.message}`);
        res.status(500).send('An error occurred. Please try again later.');
    }
});
// ok wtf could ben ot in index ?
process.on('uncaughtException', (error) => {
    log.error(`Uncaught Exception: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
    log.error(`Unhandled Rejection at: ${promise} reason: ${reason.message || reason}`);
});

loadAndActivatePlugins();

const pluginSidebarloader = () => pluginSidebar;

module.exports.pluginSidebar = pluginSidebarloader;
module.exports = router;