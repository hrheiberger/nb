
const express = require('express');
const router = express.Router();
const { canvasUniversities } = require('./utils');  

/**
* Get all Canvas-enabled universities
* @name GET/api/canvas/universities
*/
router.get('/universities', async (req, res) => {
    res.status(200).json(canvasUniversities);
});

module.exports = router;