const router = require('express').Router();
const { getAll, update, getLocations, createLocation, updateLocation, deleteLocation, getPublicInfo } = require('../controllers/settingsController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.get('/public', getPublicInfo);

router.use(verifyToken, requireAdmin);

router.get('/', getAll);
router.put('/', update);
router.get('/locations', getLocations);
router.post('/locations', createLocation);
router.put('/locations/:id', updateLocation);
router.delete('/locations/:id', deleteLocation);

module.exports = router;
