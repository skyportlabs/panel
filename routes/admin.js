/**
 * @fileoverview This module sets up administrative routes for managing and monitoring server nodes
 * within the network. It provides functionality to create, delete, and debug nodes, as well as check
 * their current status. User authentication and admin role verification are enforced for access to
 * these routes.
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { db } = require('../handlers/db.js');
const config = require('../config.json');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const multer = require('multer');
const path = require('path')
const fs = require('node:fs')
const {logAudit} = require('../handlers/auditlog.js');
const nodemailer = require('nodemailer');
const { sendTestEmail } = require('../handlers/email.js');

/**
 * Middleware to verify if the user is an administrator.
 * Checks if the user object exists and if the user has admin privileges. If not, redirects to the
 * home page. If the user is an admin, proceeds to the next middleware or route handler.
 *
 * @param {Object} req - The request object, containing user data.
 * @param {Object} res - The response object.
 * @param {Function} next - The next middleware or route handler to be executed.
 * @returns {void} Either redirects or proceeds by calling next().
 */
function isAdmin(req, res, next) {
  if (!req.user || req.user.admin !== true) {
    return res.redirect('../');
  }
  next();
}

async function doesUserExist(username) {
  const users = await db.get('users');
  if (users) {
      return users.some(user => user.username === username);
  } else {
      return false; // If no users found, return false
  }
}

async function doesEmailExist(email) {
  const users = await db.get('users');
  if (users) {
      return users.some(user => user.email === email);
  } else {
      return false; // If no users found, return false
  }
}

/**
 * Checks the operational status of a node by making an HTTP request to its API.
 * Updates the node's status based on the response or sets it as 'Offline' if the request fails.
 * This status check and update are persisted in the database.
 *
 * @param {Object} node - The node object containing details such as address, port, and API key.
 * @returns {Promise<Object>} Returns the updated node object after attempting to verify its status.
 */
async function checkNodeStatus(node) {
  try {
    const RequestData = {
      method: 'get',
      url: 'http://' + node.address + ':' + node.port + '/',
      auth: {
        username: 'Skyport',
        password: node.apiKey
      },
      headers: { 
        'Content-Type': 'application/json'
      }
    };
    const response = await axios(RequestData);
    const { versionFamily, versionRelease, online, remote, docker } = response.data;

    node.status = 'Online';
    node.versionFamily = versionFamily;
    node.versionRelease = versionRelease;
    node.remote = remote;
    node.docker = docker;

    await db.set(node.id + '_node', node); // Update node info with new details
    return node;
  } catch (error) {
    node.status = 'Offline';
    await db.set(node.id + '_node', node); // Update node as offline if there's an error
    return node;
  }
}

router.get('/admin/apikeys', isAdmin, async (req, res) => {
  try {
    const apiKeys = await db.get('apiKeys') || [];
    res.render('admin/apikeys', { req, user: req.user, apiKeys, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve API keys' });
  }
});

router.post('/apikeys/create', isAdmin, async (req, res) => {
  try {
    const newApiKey = {
      id: uuidv4(),
      key: 'skyport_' + uuidv4(),
      createdAt: new Date().toISOString()
    };
    
    let apiKeys = await db.get('apiKeys') || [];
    apiKeys.push(newApiKey);
    await db.set('apiKeys', apiKeys);
    
    res.status(201).json(newApiKey);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.delete('/apikeys/delete', isAdmin, async (req, res) => {
  try {
    const { keyId } = req.body;
    let apiKeys = await db.get('apiKeys') || [];
    apiKeys = apiKeys.filter(key => key.id !== keyId);
    await db.set('apiKeys', apiKeys);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete API key' });
  }
});

/**
 * GET /nodes/debug
 * Asynchronously retrieves and updates the status of all nodes registered in the database.
 * Available only to administrators. The status of each node is checked and updated through a
 * specific function call which queries the node's API.
 *
 * @returns {Response} Returns a JSON array of all nodes with their updated statuses.
 */
router.get('/nodes/debug', isAdmin, async (req, res) => {
  const nodeIds = await db.get('nodes') || [];
  const nodes = await Promise.all(nodeIds.map(id => db.get(id + '_node').then(checkNodeStatus)));
  res.json(nodes);
});

/**
 * GET /account/debug
 * Provides debug information about the currently logged-in user. Available only to administrators.
 * Ensures that user data is available in the request object, then returns this data in JSON format.
 *
 * @returns {Response} Returns a JSON object containing user details if available; otherwise, sends a debug error message.
 */
router.get('/account/debug', isAdmin, async (req, res) => {
  if (!req.user) res.send('no req.user present!')
  res.json(req.user);
});

/**
 * GET /admin/node/:id/configure-command
 * Generates a configuration command for a specific node.
 */
router.get('/admin/node/:id/configure-command', isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the node from the database
    const node = await db.get(id + '_node');

    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    // Generate a new configure key
    const configureKey = uuidv4();

    // Update the node with the new configure key
    node.configureKey = configureKey;
    await db.set(id + '_node', node);

    // Construct the configuration command
    const panelUrl = `${req.protocol}://${req.get('host')}`;
    const configureCommand = `npm run configure -- --panel ${panelUrl} --key ${configureKey}`;

    // Return the configuration command
    res.json({
      nodeId: id,
      configureCommand: configureCommand
    });

  } catch (error) {
    console.error('Error generating configure command:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /admin/overview
 * Retrieves counts of users, nodes, images, and instances from the database.
 * Available only to administrators and renders an overview page displaying the counts.
 *
 * @returns {Response} Renders the 'overview' view with the total counts.
 */
router.get('/admin/overview', isAdmin, async (req, res) => {
  try {
      const users = await db.get('users') || [];
      const nodes = await db.get('nodes') || [];
      const images = await db.get('images') || [];
      const instances = await db.get('instances') || [];

      // Calculate the total number of each type of object
      const usersTotal = users.length;
      const nodesTotal = nodes.length;
      const imagesTotal = images.length;
      const instancesTotal = instances.length;

      res.render('admin/overview', { req, user: req.user, usersTotal, nodesTotal, imagesTotal, instancesTotal, version: config.version, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
  } catch (error) {
      res.status(500).send({ error: 'Failed to retrieve data from the database.' });
  }
});


/**
 * POST /nodes/create
 * Creates a new node with a unique configureKey for secure configuration.
 */
router.post('/nodes/create', isAdmin, async (req, res) => {
  const configureKey = uuidv4(); // Generate a unique configureKey
  const node = {
    id: uuidv4(),
    name: req.body.name,
    tags: req.body.tags,
    ram: req.body.ram,
    disk: req.body.disk,
    processor: req.body.processor,
    address: req.body.address,
    port: req.body.port,
    apiKey: null, // Set to null initially
    configureKey: configureKey, // Add the configureKey
    status: 'Unconfigured' // Status to indicate pending configuration
  };

  if (!req.body.name || !req.body.tags || !req.body.ram || !req.body.disk || !req.body.processor || !req.body.address || !req.body.port) {
    return res.status(400).send('Form validation failure.');
  }

  await db.set(node.id + '_node', node);

  const nodes = await db.get('nodes') || [];
  nodes.push(node.id);
  await db.set('nodes', nodes);

  // Return the node object including the configureKey
  logAudit(req.user.userId, req.user.username, 'node:create', req.ip);
  res.status(201).json({
    ...node,
    configureKey: configureKey // Include configureKey in the response
  });
});

/**
 * POST /nodes/configure
 * Allows a node to set its own access key using the configureKey.
 * The request must include a valid authKey from config.json for security.
 */
router.post('/nodes/configure', async (req, res) => {
  const { configureKey, accessKey } = req.query;

  if (!configureKey || !accessKey) {
    return res.status(400).json({ error: 'Missing configureKey or accessKey' });
  }

  try {
    // Find the node with the matching configureKey
    const nodes = await db.get('nodes') || [];
    let foundNode = null;
    for (const nodeId of nodes) {
      const node = await db.get(nodeId + '_node');
      if (node && node.configureKey === configureKey) {
        foundNode = node;
        break;
      }
    }

    if (!foundNode) {
      return res.status(404).json({ error: 'Node not found' });
    }

    // Update the node with the new accessKey
    foundNode.apiKey = accessKey;
    foundNode.status = 'Configured';
    foundNode.configureKey = null; // Remove the configureKey after successful configuration

    await db.set(foundNode.id + '_node', foundNode);

    res.status(200).json({ message: 'Node configured successfully' });
  } catch (error) {
    console.error('Error configuring node:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/users/create', isAdmin, async (req, res) => {
  const { username, email, password, admin, verified } = req.body;

  if (!username || !email || !password) {
    return res.status(400).send('Username, email, and password are required.');
  }

  if (typeof admin !== 'boolean') {
    return res.status(400).send('Admin field must be true or false.');
  }

  const userExists = await doesUserExist(username);
  if (userExists) {
    return res.status(400).send('User already exists.');
  }

  const emailExists = await doesEmailExist(email);
  if (emailExists) {
    return res.status(400).send('Email already exists.');
  }

  const userId = uuidv4();
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  const newUser = {
    userId,
    username,
    email,
    password: hashedPassword,
    accessTo: [],
    admin,
    verified: verified || false,
  };

  let users = await db.get('users') || [];
  users.push(newUser);
  await db.set('users', users);

  logAudit(req.user.userId, req.user.username, 'user:create', req.ip);

  res.status(201).send(newUser);
});

router.delete('/user/delete', isAdmin, async (req, res) => {
  const userId = req.body.userId;
  const users = await db.get('users') || [];

  const userIndex = users.findIndex(user => user.userId === userId);

  if (userIndex === -1) {
    return res.status(400).send('The specified user does not exist');
  }

  users.splice(userIndex, 1);
  await db.set('users', users);
  logAudit(req.user.userId, req.user.username, 'user:delete', req.ip);
  res.status(204).send();
});

router.get('/admin/users/edit/:userId', isAdmin, async (req, res) => {
  const userId = req.params.userId;
  const users = await db.get('users') || [];
  const user = users.find(user => user.userId === userId);

  if (!user) {
    return res.status(404).send('User not found');
  }

  res.render('admin/edit-user', {
    req,
    user: req.user,
    editUser: user,
    name: await db.get('name') || 'Skyport',
    logo: await db.get('logo') || false
  });
});

router.post('/admin/users/edit/:userId', isAdmin, async (req, res, next) => {
  const userId = req.params.userId;
  const { username, email, password, admin, verified } = req.body;

  if (!username || !email) {
    return res.status(400).send('Username and email are required.');
  }

  const users = await db.get('users') || [];
  const userIndex = users.findIndex(user => user.userId === userId);

  if (userIndex === -1) {
    return res.status(404).send('User not found');
  }

  const userExists = users.some(user => user.username === username && user.userId !== userId);
  const emailExists = users.some(user => user.email === email && user.userId !== userId);

  if (userExists) {
    return res.status(400).send('Username already exists.');
  }

  if (emailExists) {
    return res.status(400).send('Email already exists.');
  }

  users[userIndex].username = username;
  users[userIndex].email = email;
  users[userIndex].admin = admin === 'true';
  users[userIndex].verified = verified === 'true';

  if (password) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    users[userIndex].password = hashedPassword;
  }

  await db.set('users', users);

  logAudit(req.user.userId, req.user.username, 'user:edit', req.ip);

  if (req.user.userId === userId) {
    return req.logout(err => {
      if (err) return next(err);
      res.redirect('/login?err=UpdatedCredentials');
    });
  }

  res.redirect('/admin/users');
});



/**
 * DELETE /nodes/delete
 * Deletes a node from the database based on its identifier provided in the request body. Updates the list of
 * all nodes in the database to reflect this deletion. This operation is restricted to administrators.
 *
 * @returns {Response} Sends a status response indicating the successful deletion of the node.
 */
router.delete('/nodes/delete', isAdmin, async (req, res) => {
  const nodeId = req.body.nodeId;
  const nodes = await db.get('nodes') || [];
  const newNodes = nodes.filter(id => id !== nodeId);

  if (!nodeId) return res.send('Invalid node')

  await db.set('nodes', newNodes);
  await db.delete(nodeId + '_node');
  logAudit(req.user.userId, req.user.username, 'node:delete', req.ip);
  res.status(204).send();
});

/**
 * GET /admin/nodes
 * Retrieves a list of all nodes, checks their statuses, and renders an admin page to display these nodes.
 * This route is protected and allows only administrators to view the node management page.
 *
 * @returns {Response} Renders the 'nodes' view with node data and user information.
 */
router.get('/admin/nodes', isAdmin, async (req, res) => {
  let nodes = await db.get('nodes') || [];
  let instances = await db.get('instances') || [];
  let set = {};
  nodes.forEach(function(node) {
	  set[node] = 0;
	  instances.forEach(function(instance) {
		if (instance.Node.id == node) {
			set[node]++;
		}
	  });
  });
  nodes = await Promise.all(nodes.map(id => db.get(id + '_node').then(checkNodeStatus)));

  res.render('admin/nodes', { req, user: req.user, nodes, set, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
});


/**
 * GET /admin/settings
 * Settings page. This route is protected and allows only administrators to view the settings page.
 *
 * @returns {Response} Renders the 'nodes' view with node data and user information.
 */
router.get('/admin/settings', isAdmin, async (req, res) => {
  res.render('admin/settings/appearance', { req, user: req.user, settings: await db.get('settings'), name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
});

router.get('/admin/settings/smtp', isAdmin, async (req, res) => {
  try {
    const settings = await db.get('settings');
    const smtpSettings = await db.get('smtp_settings') || {};
    
    res.render('admin/settings/smtp', {
      req,
      user: req.user,
      settings,
      name: await db.get('name') || 'Skyport',
      logo: await db.get('logo') || false,
      smtpSettings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).send('Failed to fetch settings. Please try again later.');
  }
});


router.post('/admin/settings/toggle/force-verify', isAdmin, async (req, res) => {
  try {
    const settings = await db.get('settings') || {};
    settings.forceVerify = !settings.forceVerify;

    await db.set('settings', settings);
    logAudit(req.user.userId, req.user.username, 'force-verify:edit', req.ip); // Adjust as per your logging needs

    res.redirect('/admin/settings');
  } catch (err) {
    console.error('Error toggling force verify:', err);
    res.status(500).send('Internal Server Error');
  }
});


router.post('/admin/settings/change/name', isAdmin, async (req, res) => {
  const name = req.body.name;
  try {
  await db.set('name', [name]);
  logAudit(req.user.userId, req.user.username, 'name:edit', req.ip);
  res.redirect('/admin/settings?changednameto=' + name);
} catch (err) {
  console.error(err);
  res.status(500).send("Database error");
}
});

router.post('/admin/settings/saveSmtpSettings', async (req, res) => {
  const { smtpServer, smtpPort, smtpUser, smtpPass, smtpFromName, smtpFromAddress } = req.body;

  try {
    await db.set('smtp_settings', {
      server: smtpServer,
      port: smtpPort,
      username: smtpUser,
      password: smtpPass,
      fromName: smtpFromName,
      fromAddress: smtpFromAddress
    });

    logAudit(req.user.userId, req.user.username, 'SMTP:edit', req.ip);
    res.redirect('/admin/settings/smtp?msg=SmtpSaveSuccess');
  } catch (error) {
    console.error('Error saving SMTP settings:', error);
    res.redirect('/admin/settings/smtp?err=SmtpSaveFailed');
  }
});


router.post('/sendTestEmail', async (req, res) => {
  try {
    const { recipientEmail } = req.body;

    const emailSent = await sendTestEmail(recipientEmail);

    if (emailSent) {
      res.redirect('/admin/settings/smtp?msg=TestemailSentsuccess');
    } else {
      res.redirect('/admin/settings/smtp?err=TestemailSentfailed'); 
    }
  } catch (error) {
    console.error('Error sending test email:', error);
    res.redirect('/admin/settings/smtp?err=TestemailSentfailed');
  }
});


// Configure multer for file upload
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, '..', 'public', 'assets');
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      cb(null, 'logo.png');
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image file.'), false);
    }
  }
});

router.post('/admin/settings/change/logo', isAdmin, upload.single('logo'), async (req, res) => {
  const type = req.body.type;

  try {
    if (type === 'image' && req.file) {
      // Image uploaded successfully
      await db.set('logo', true);
      res.redirect('/admin/settings');
    } else if (type === 'none') {
      // Remove existing logo
      const logoPath = path.join(__dirname, '..', 'public', 'assets', 'logo.png');
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
      await db.set('logo', false);
      logAudit(req.user.userId, req.user.username, 'logo:edit', req.ip);
      res.redirect('/admin/settings');
    } else {
      res.status(400).send('Invalid request');
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Error processing logo change: " + err.message);
  }
});

router.post('/admin/settings/toggle/register', isAdmin, upload.single('logo'), async (req, res) => {
  let settings = await db.get('settings');
  settings.register = !settings.register;
  await db.set('settings', settings);
  logAudit(req.user.userId, req.user.username, 'register:edit', req.ip);
  res.redirect('/admin/settings');
});
/**
 * GET /admin/instances
 * Retrieves a list of all instances, checks their statuses, and renders an admin page to display these instances.
 * This route is protected and allows only administrators to view the instance management page.
 *
 * @returns {Response} Renders the 'instances' view with instance data and user information.
 */
router.get('/admin/instances', isAdmin, async (req, res) => {
  let instances = await db.get('instances') || [];
  let images = await db.get('images') || [];
  let nodes = await db.get('nodes') || [];
  let users = await db.get('users') || [];

  nodes = await Promise.all(nodes.map(id => db.get(id + '_node').then(checkNodeStatus)));

  res.render('admin/instances', { req, user: req.user, instances, images, nodes, users, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
});


router.get('/admin/instances/:id/edit', isAdmin, async (req, res) => {
  const { id } = req.params;
  const instance = await db.get(id + '_instance');
  let users = await db.get('users') || [];
  let images = await db.get('images') || [];

  if (!instance) return res.redirect('/admin/instances');
  res.render('admin/instance_edit', { req, user: req.user, instance, images, users, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
})

router.get('/admin/users', isAdmin, async (req, res) => {
  let users = await db.get('users') || [];

  res.render('admin/users', { req, user: req.user, users, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
});

/**
 * GET /admin/node/:id
 * Renders the page for a specific node identified by its unique ID.
 * The endpoint retrieves the node details from the database,
 * and renders the 'admin/node' view with the retrieved data.
 *
 * @param {string} id - The unique identifier of the node to fetch.
 * @returns {Response} Redirects to the nodes overview page if the node does not exist
 * or the ID is not provided. Otherwise, renders the node page with appropriate data.
 */
 
router.get("/admin/node/:id", async (req, res) => {
    const { id } = req.params;
    const node = await db.get(id + '_node');

    if (!node || !id) return res.redirect('../nodes')

    res.render('admin/node', { req, node, user: req.user, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
});


/**
 * POST /admin/node/:id
 * Edit an existing node with specified parameters from the request body, such as name, hardware specifications.
 *
 * @returns {Response} Sends the node data if all goes ok else 400 if the node doesn't exist.
 */
 
router.post("/admin/node/:id", async (req, res) => {

	const { id } = req.params;
	const cnode = await db.get(id + '_node');

    if (!cnode || !id) return res.status(400).send();
	
    const node = {
		id: id,
		name: req.body.name,
		tags: req.body.tags,
		ram: req.body.ram,
		disk: req.body.disk,
		processor: req.body.processor,
		address: req.body.address,
		port: req.body.port,
		apiKey: req.body.apiKey,
		status: 'Unknown' // Default status
	};

    await db.set(node.id + '_node', node); 
	const updatedNode = await checkNodeStatus(node);
	res.status(201).send(updatedNode);
});

/**
 * GET /admin/images
 *
 * @returns {Response} Renders the 'images' view with image data.
 */
router.get('/admin/images', isAdmin, async (req, res) => {
  let images = await db.get('images') || [];

  res.render('admin/images', { req, user: req.user, images, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
});

router.post('/admin/images/upload', isAdmin, async (req, res) => {
  try {
    let jsonData = req.body;
    jsonData.Id = uuidv4();
    let images = await db.get('images') || [];
    images.push(jsonData);
    await db.set('images', images);
    res.status(200).send('image uploaded successfully.');
  } catch (err) {
    console.error('Error uploading image:', err);
    res.status(500).send('Error uploading image.');
  }
});

router.post('/admin/images/delete', isAdmin, async (req, res) => {
  try {
    let { id } = req.body;
    let images = await db.get('images') || [];
    images = images.filter(image => image.Id !== id);
    await db.set('images', images);
    res.status(200).send('image deleted successfully.');
  } catch (err) {
    console.error('Error deleting image:', err);
    res.status(500).send('Error deleting image.');
  }
});


// Endpoint to delete a single instance
router.get('/admin/instance/delete/:id', isAdmin, async (req, res) => {
  const { id } = req.params;
  
  try {
    if (!id) {
      return res.redirect('/admin/instances');
    }
    
    const instance = await db.get(id + '_instance');
    if (!instance) {
      return res.status(404).send('Instance not found');
    }
    
    await deleteInstance(instance);
    logAudit(req.user.userId, req.user.username, 'instance:delete', req.ip);
    res.redirect('/admin/instances');
  } catch (error) {
    console.error('Error in delete instance endpoint:', error);
    res.status(500).send('An error occurred while deleting the instance');
  }
});

// Endpoint to purge all instances
router.get('/admin/instances/purge/all', isAdmin, async (req, res) => {
  try {
    const instances = await db.get('instances') || [];
    
    for (const instance of instances) {
      await deleteInstance(instance);
    }
    
    await db.delete('instances');
    res.redirect('/admin/instances');
  } catch (error) {
    console.error('Error in purge all instances endpoint:', error);
    res.status(500).send('An error occurred while purging all instances');
  }
});

router.post('/admin/instances/suspend/:id', isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    if (!id) {
      return res.redirect('/admin/instances');
    }
    const instance = await db.get(id + '_instance');
    if (!instance) {
      return res.status(404).send('Instance not found');
    }

    instance.suspended = true;
    await db.set(id + '_instance', instance);
    let instances = await db.get('instances') || [];

    let instanceToSuspend = instances.find(obj => obj.ContainerId === instance.ContainerId);
    if (instanceToSuspend) {
      instanceToSuspend.suspended = true;
    }

    await db.set('instances', instances);

    logAudit(req.user.userId, req.user.username, 'instance:suspend', req.ip);
    res.redirect('/admin/instances');
  } catch (error) {
    console.error('Error in suspend instance endpoint:', error);
    res.status(500).send('An error occurred while suspending the instance');
  }
});

router.post('/admin/instances/unsuspend/:id', isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    if (!id) {
      return res.redirect('/admin/instances');
    }
    const instance = await db.get(id + '_instance');
    if (!instance) {
      return res.status(404).send('Instance not found');
    }

    instance.suspended = false;

    await db.set(id + '_instance', instance);

    let instances = await db.get('instances') || [];

    let instanceToUnsuspend = instances.find(obj => obj.ContainerId === instance.ContainerId);
    if (instanceToUnsuspend) {
      instanceToUnsuspend.suspended = false;
    }

    await db.set('instances', instances);

    logAudit(req.user.userId, req.user.username, 'instance:unsuspend', req.ip);

    res.redirect('/admin/instances');
  } catch (error) {
    console.error('Error in unsuspend instance endpoint:', error);
    res.status(500).send('An error occurred while unsuspending the instance');
  }
});


async function deleteInstance(instance) {
  try {
    await axios.get(`http://Skyport:${instance.Node.apiKey}@${instance.Node.address}:${instance.Node.port}/instances/${instance.ContainerId}/delete`);
    
    let userInstances = await db.get(instance.User + '_instances') || [];
    userInstances = userInstances.filter(obj => obj.ContainerId !== instance.ContainerId);
    await db.set(instance.User + '_instances', userInstances);
    
    let globalInstances = await db.get('instances') || [];
    globalInstances = globalInstances.filter(obj => obj.ContainerId !== instance.ContainerId);
    await db.set('instances', globalInstances);
    
    await db.delete(instance.ContainerId + '_instance');
  } catch (error) {
    console.error(`Error deleting instance ${instance.ContainerId}:`, error);
    throw error;
  }
}

router.get('/admin/auditlogs', isAdmin, async (req, res) => {
  try {
    let audits = await db.get('audits');
    audits = audits ? JSON.parse(audits) : [];
    res.render('admin/auditlogs', { req, user: req.user, audits, name: await db.get('name') || 'Skyport', logo: await db.get('logo') || false });
  } catch (err) {
    console.error('Error fetching audits:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
