const express = require('express');
const {
    getSubscriptionStatus,
    getSubscriptionHistory,
    getAvailablePlans,
    renewSubscription,
    upgradeSubscription
} = require('../controllers/subscriptionController');
const { authenticateToken } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(authenticateToken);

router.get('/status', getSubscriptionStatus);
router.get('/history', getSubscriptionHistory);
router.get('/plans', getAvailablePlans);
router.post('/renew', renewSubscription);
router.post('/upgrade', upgradeSubscription);

module.exports = router;
