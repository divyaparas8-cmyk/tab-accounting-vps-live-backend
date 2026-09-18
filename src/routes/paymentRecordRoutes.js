const express = require('express');
const router = express.Router();
const paymentRecordController = require('../controllers/paymentRecordController');
const { authenticateToken } = require('../middlewares/authMiddleware');

router.get('/', authenticateToken, paymentRecordController.getPaymentRecords);
router.get('/:id', authenticateToken, paymentRecordController.getPaymentRecordById);
router.post('/', authenticateToken, paymentRecordController.createPaymentRecord);
router.put('/:id', authenticateToken, paymentRecordController.updatePaymentRecord);
router.delete('/:id', authenticateToken, paymentRecordController.deletePaymentRecord);

module.exports = router;
