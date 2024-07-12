const fs = require('fs');
const path = require('path');
const express = require('express');
const router = express.Router();

function loadPlugins(pluginDir) {
    const plugins = {};
    const pluginFolders = fs.readdirSync(pluginDir);
//make a check that it only loads the enabled plugins from the plugins.json
    pluginFolders.forEach(folder => {
        const folderPath = path.join(pluginDir, folder);
        const indexPath = path.join(folderPath, 'index.js');
        const configPath = path.join(folderPath, 'manifest.json');

        if (fs.existsSync(indexPath) && fs.existsSync(configPath)) {
            const pluginConfig = require(configPath);
            const pluginModule = require(indexPath);

            plugins[folder] = {
                config: pluginConfig,
                module: pluginModule
            };
        }
    });

    return plugins;
}
module.exports = router;
module.exports.loadPlugins = loadPlugins;