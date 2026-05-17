const router = require('express').Router();
const { getAll, update, getLocations, createLocation, updateLocation, deleteLocation, getPublicInfo, getLicenseInfo } = require('../controllers/settingsController');
const { verifyToken, requireAdmin } = require('../middleware/auth');

router.get('/public', getPublicInfo);

// License info — accessible by any logged-in user (for footer display)
router.get('/license-info', verifyToken, getLicenseInfo);

router.use(verifyToken, requireAdmin);

router.get('/', getAll);
router.put('/', update);
router.get('/locations', getLocations);
router.post('/locations', createLocation);
router.put('/locations/:id', updateLocation);
router.delete('/locations/:id', deleteLocation);

module.exports = router;
