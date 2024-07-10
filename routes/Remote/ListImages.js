const express = require('express');
const { db } = require('../../handlers/db.js');

const router = express.Router();

/**
 * GET /images/list
 * Provides a list of all images available in the database for skyportd to use on boot.
 *
 * @returns {Response} Sends a JSON response containing an array of images.
 */
router.get('/images/list', async (req, res) => {
  try {
    const images = await db.get('images');
    res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

module.exports = router;