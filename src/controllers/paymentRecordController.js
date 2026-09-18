const prisma = require('../config/prisma');

// Generate unique transaction ID
const generateTransactionId = () => {
    const randomNum = Math.floor(100000000 + Math.random() * 900000000);
    return `TXN${randomNum}`;
};

// GET /api/payments or /api/superadmin/payments
const getPaymentRecords = async (req, res) => {
    try {
        const { search, status, paymentMethod, startDate, endDate } = req.query;

        const where = {};

        if (status) {
            where.status = { equals: status };
        }

        if (paymentMethod) {
            where.paymentMethod = { equals: paymentMethod };
        }

        if (startDate || endDate) {
            where.date = {};
            if (startDate) where.date.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                where.date.lte = end;
            }
        }

        if (search) {
            where.OR = [
                { transactionId: { contains: search } },
                { customer: { contains: search } },
                { paymentMethod: { contains: search } }
            ];
        }

        const payments = await prisma.paymentrecord.findMany({
            where,
            orderBy: {
                date: 'desc'
            }
        });

        res.json(payments);
    } catch (error) {
        console.error('Get Payment Records Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};

// GET /api/payments/:id
const getPaymentRecordById = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid ID format' });
        }

        const payment = await prisma.paymentrecord.findUnique({
            where: { id }
        });

        if (!payment) {
            return res.status(404).json({ error: 'Payment record not found' });
        }

        res.json(payment);
    } catch (error) {
        console.error('Get Payment Record By ID Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};

// POST /api/payments
const createPaymentRecord = async (req, res) => {
    try {
        const {
            transactionId,
            date,
            customer,
            paymentMethod,
            amount,
            status
        } = req.body;

        if (!customer) {
            return res.status(400).json({ error: 'Customer / Company name is required' });
        }

        if (amount === undefined || amount === null || isNaN(parseFloat(amount))) {
            return res.status(400).json({ error: 'Valid amount is required' });
        }

        const newPayment = await prisma.paymentrecord.create({
            data: {
                transactionId: transactionId ? transactionId.trim() : generateTransactionId(),
                date: date ? new Date(date) : new Date(),
                customer: customer.trim(),
                paymentMethod: paymentMethod || 'Credit Card',
                amount: parseFloat(amount),
                status: status || 'Pending'
            }
        });

        res.status(201).json(newPayment);
    } catch (error) {
        console.error('Create Payment Record Error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Transaction ID already exists' });
        }
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};

// PUT /api/payments/:id
const updatePaymentRecord = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid ID format' });
        }

        const {
            transactionId,
            date,
            customer,
            paymentMethod,
            amount,
            status
        } = req.body;

        const updateData = {};
        if (transactionId !== undefined) updateData.transactionId = transactionId.trim();
        if (date !== undefined) updateData.date = new Date(date);
        if (customer !== undefined) updateData.customer = customer.trim();
        if (paymentMethod !== undefined) updateData.paymentMethod = paymentMethod;
        if (amount !== undefined) updateData.amount = parseFloat(amount);
        if (status !== undefined) updateData.status = status;

        const updated = await prisma.paymentrecord.update({
            where: { id },
            data: updateData
        });

        res.json(updated);
    } catch (error) {
        console.error('Update Payment Record Error:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Payment record not found' });
        }
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};

// DELETE /api/payments/:id
const deletePaymentRecord = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid ID format' });
        }

        await prisma.paymentrecord.delete({
            where: { id }
        });

        res.json({ message: 'Payment record deleted successfully' });
    } catch (error) {
        console.error('Delete Payment Record Error:', error);
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Payment record not found' });
        }
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};

module.exports = {
    getPaymentRecords,
    getPaymentRecordById,
    createPaymentRecord,
    updatePaymentRecord,
    deletePaymentRecord,
    generateTransactionId
};
