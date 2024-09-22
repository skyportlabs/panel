const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('index', {
        user: req.user
    });
});

module.exports = router;