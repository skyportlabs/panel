const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();

const pluginsJsonPath = path.join('./plugins', 'plugins.json');

function readPluginsJson() {
    try {
        const pluginsJson = fs.readFileSync(pluginsJsonPath, 'utf8');
        return JSON.parse(pluginsJson);
    } catch (error) {
        console.error('Error reading plugins.json:', error);
        return {};
    }
}

function loadPlugins(pluginDir) {
    const plugins = {};
    const pluginFolders = fs.readdirSync(pluginDir);
    const pluginsJson = readPluginsJson();

    pluginFolders.forEach(folder => {
        const folderPath = path.join(pluginDir, folder);

        if (fs.statSync(folderPath).isDirectory()) {
            const configPath = path.join(folderPath, 'manifest.json');

            if (!fs.existsSync(configPath)) {
                console.warn(`Manifest file does not exist for plugin ${folder}.`);
                return;
            }

            const pluginConfig = require(configPath);

            if (!pluginsJson[pluginConfig.name]) {
                console.warn(`Plugin ${pluginConfig.name} is not found in plugins.json.`);
                return;
            }

            if (!pluginsJson[pluginConfig.name].enabled) {
                return;
            }

            plugins[folder] = {
                config: pluginConfig,
            };
        }
    });

    return plugins;
}

module.exports = router;
module.exports.loadPlugins = loadPlugins;