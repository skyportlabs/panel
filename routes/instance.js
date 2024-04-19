const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { db } = require('../handlers/db.js'); // Ensure db.js is properly set up to use Keyv

module.exports = router;