const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');

router.get('/', announcementController.getAll);
router.post('/', announcementController.create);
router.put('/:id', announcementController.update);
router.delete('/:id', announcementController.delete);

module.exports = router;
