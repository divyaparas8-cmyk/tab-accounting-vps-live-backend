const prisma = require('../config/prisma');
const { clearCompanyExpiryCache } = require('../middlewares/authMiddleware');

const deriveCompanyPermissions = (modulesData) => {
    let modulesArray = [];
    try {
        if (typeof modulesData === 'string') {
            modulesArray = JSON.parse(modulesData);
        } else if (Array.isArray(modulesData)) {
            modulesArray = modulesData;
        }
    } catch (e) {
        console.error("Module parse error in deriveCompanyPermissions:", e);
    }

    const enabledModules = modulesArray.filter(m => m && m.enabled).map(m => (m.name || m.module_name || "").toLowerCase());

    let defaultPermissions = [
        "show dashboard",
        "manage voucher", "create voucher", "edit voucher", "delete voucher",
        "manage reports", "view reports",
        "manage user", "create user", "edit user", "delete user",
        "manage role", "create role", "edit role", "delete role",
        "manage settings", "edit settings", "view settings"
    ];

    const moduleMapping = {
        'account': ["manage accounts", "create accounts", "edit accounts", "delete accounts", "view accounts"],
        'accounts': ["manage accounts", "create accounts", "edit accounts", "delete accounts", "view accounts"],
        'inventory': ["manage inventory", "create inventory", "edit inventory", "delete inventory", "view inventory"],
        'sales': ["manage sales", "create sales", "edit sales", "delete sales", "show sales", "send sales", "view sales"],
        'purchase': ["manage purchases", "create purchases", "edit purchases", "delete purchases", "view purchases"],
        'purchases': ["manage purchases", "create purchases", "edit purchases", "delete purchases", "view purchases"],
        'pos': ["manage pos", "create pos", "edit pos", "delete pos", "view pos"]
    };

    enabledModules.forEach(modName => {
        for (const key in moduleMapping) {
            if (modName.includes(key)) {
                defaultPermissions = [...new Set([...defaultPermissions, ...moduleMapping[key]])];
            }
        }
    });

    return defaultPermissions;
};

// GET /api/company/subscription/status
const getSubscriptionStatus = async (req, res) => {
    try {
        const companyId = parseInt(req.user?.companyId);
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID not found in token' });
        }

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: { plan: true }
        });

        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        const now = new Date();

        let isExpired = false;
        let daysRemaining = 0;
        let daysExpired = 0;
        let status = 'ACTIVE';

        if (company.endDate) {
            const expiryDate = new Date(company.endDate);
            expiryDate.setHours(23, 59, 59, 999);
            
            const diffTime = expiryDate.getTime() - now.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                isExpired = true;
                status = 'EXPIRED';
                daysExpired = Math.abs(diffDays);
                daysRemaining = 0;
            } else {
                isExpired = false;
                status = 'ACTIVE';
                daysRemaining = Math.max(0, diffDays);
                daysExpired = 0;
            }
        }

        // Parse plan modules & descriptions if present
        let parsedModules = [];
        let parsedDescriptions = [];
        if (company.plan) {
            try {
                parsedModules = typeof company.plan.modules === 'string' ? JSON.parse(company.plan.modules) : (company.plan.modules || []);
            } catch (e) {}
            try {
                parsedDescriptions = typeof company.plan.descriptions === 'string' ? JSON.parse(company.plan.descriptions) : (company.plan.descriptions || []);
            } catch (e) {}
        }

        res.json({
            companyId: company.id,
            companyName: company.name,
            planId: company.planId,
            planName: company.planName || company.plan?.name || 'Standard Plan',
            planType: company.planType || 'Monthly',
            startDate: company.startDate,
            expiryDate: company.endDate,
            status,
            isExpired,
            daysRemaining,
            daysExpired,
            plan: company.plan ? {
                ...company.plan,
                modules: parsedModules,
                descriptions: parsedDescriptions
            } : null
        });
    } catch (error) {
        console.error('getSubscriptionStatus error:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

// GET /api/company/subscription/history
const getSubscriptionHistory = async (req, res) => {
    try {
        const companyId = parseInt(req.user?.companyId);
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID not found in token' });
        }

        let subscriptions = await prisma.subscription.findMany({
            where: { companyId },
            include: { plan: true },
            orderBy: { createdAt: 'desc' }
        });

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: { plan: true }
        });

        // If company has active endDate, ensure the active subscription record is present in history
        if (company && company.endDate) {
            const expDate = new Date(company.endDate);
            expDate.setHours(23, 59, 59, 999);
            const isPlanActive = expDate.getTime() >= Date.now();

            const hasMatchingActiveSub = subscriptions.some(s => {
                if (s.status !== 'ACTIVE') return false;
                const subExp = new Date(s.expiryDate);
                subExp.setHours(23, 59, 59, 999);
                return subExp.getTime() >= Date.now();
            });

            if (isPlanActive && !hasMatchingActiveSub) {
                // Archive older active subscriptions
                await prisma.subscription.updateMany({
                    where: { companyId, status: 'ACTIVE' },
                    data: { status: 'EXPIRED' }
                });

                const newActiveSub = await prisma.subscription.create({
                    data: {
                        companyId: company.id,
                        planId: company.planId,
                        startDate: company.startDate || new Date(),
                        expiryDate: company.endDate,
                        billingCycle: company.planType || 'Yearly',
                        amount: parseFloat(company.plan?.totalPrice || company.plan?.basePrice || 0),
                        status: 'ACTIVE',
                        paymentReference: `ADMIN_SYNC_${Date.now()}`
                    },
                    include: { plan: true }
                });
                subscriptions.unshift(newActiveSub);
            }
        } else if (subscriptions.length === 0 && company) {
            // Initial fallback if no subscriptions exist
            const initialSub = await prisma.subscription.create({
                data: {
                    companyId: company.id,
                    planId: company.planId,
                    startDate: company.startDate || new Date(),
                    expiryDate: company.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    billingCycle: company.planType || 'Monthly',
                    amount: parseFloat(company.plan?.totalPrice || company.plan?.basePrice || 0),
                    status: 'EXPIRED',
                    paymentReference: 'INITIAL_ACTIVATION'
                },
                include: { plan: true }
            });
            subscriptions = [initialSub];
        }

        // Format history response
        const formattedHistory = subscriptions.map(sub => {
            const now = new Date();
            const expDate = new Date(sub.expiryDate);
            expDate.setHours(23, 59, 59, 999);
            
            let status = sub.status;
            if (status === 'ACTIVE' && expDate.getTime() < now.getTime()) {
                status = 'EXPIRED';
            }

            return {
                id: sub.id,
                planId: sub.planId,
                planName: sub.plan?.name || company?.planName || 'Standard Plan',
                billingCycle: sub.billingCycle,
                startDate: sub.startDate,
                expiryDate: sub.expiryDate,
                amount: sub.amount,
                status: status,
                paymentReference: sub.paymentReference,
                createdAt: sub.createdAt
            };
        });

        res.json(formattedHistory);
    } catch (error) {
        console.error('getSubscriptionHistory error:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

// GET /api/company/subscription/available-plans
const getAvailablePlans = async (req, res) => {
    try {
        const plans = await prisma.plan.findMany({
            where: {
                status: { in: ['Active', 'active', 'ACTIVE'] }
            },
            orderBy: {
                basePrice: 'asc'
            }
        });

        const parsedPlans = plans.map(p => {
            let modules = [];
            let descriptions = [];
            try {
                modules = typeof p.modules === 'string' ? JSON.parse(p.modules) : (p.modules || []);
            } catch (e) {}
            try {
                descriptions = typeof p.descriptions === 'string' ? JSON.parse(p.descriptions) : (p.descriptions || []);
            } catch (e) {}

            const basePrice = parseFloat(p.basePrice) || 0;
            const totalPrice = parseFloat(p.totalPrice) || basePrice;

            return {
                ...p,
                basePrice,
                totalPrice,
                modules,
                descriptions
            };
        });

        res.json(parsedPlans);
    } catch (error) {
        console.error('getAvailablePlans error:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

// POST /api/company/subscription/renew
const renewSubscription = async (req, res) => {
    try {
        const companyId = parseInt(req.user?.companyId);
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID not found in token' });
        }

        const { billingCycle, paymentMethod } = req.body;

        const company = await prisma.company.findUnique({
            where: { id: companyId },
            include: { plan: true }
        });

        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        // Determine plan
        let plan = company.plan;
        if (!plan && company.planId) {
            plan = await prisma.plan.findUnique({ where: { id: company.planId } });
        }
        if (!plan) {
            plan = await prisma.plan.findFirst({ where: { status: 'Active' }, orderBy: { id: 'asc' } });
        }

        const cycle = billingCycle || company.planType || 'Monthly';
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let newStart = new Date();
        let newEnd = new Date();

        // If current endDate exists and is in the future, extend from that date
        if (company.endDate && new Date(company.endDate) > today) {
            newStart = new Date(company.startDate || today);
            newEnd = new Date(company.endDate);
        } else {
            // Already expired or no endDate, start from today
            newStart = new Date();
            newEnd = new Date();
        }

        if (cycle === 'Yearly') {
            newEnd.setFullYear(newEnd.getFullYear() + 1);
        } else {
            newEnd.setMonth(newEnd.getMonth() + 1);
        }

        // Calculate amount in Euro
        let amount = parseFloat(plan?.totalPrice || plan?.basePrice || 0);
        if (cycle === 'Yearly') {
            amount = amount * 12; // Or annual discount if applicable
        }

        const paymentRef = `RNW-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Transaction to ensure consistency
        const result = await prisma.$transaction(async (tx) => {
            // Mark older active subscriptions as EXPIRED / COMPLETED
            await tx.subscription.updateMany({
                where: { companyId, status: 'ACTIVE' },
                data: { status: 'EXPIRED' }
            });

            // Create new ACTIVE subscription record
            const newSub = await tx.subscription.create({
                data: {
                    companyId: company.id,
                    planId: plan ? plan.id : null,
                    startDate: newStart,
                    expiryDate: newEnd,
                    billingCycle: cycle,
                    amount: amount,
                    status: 'ACTIVE',
                    paymentReference: paymentRef
                }
            });

            // Record payment for Super Admin revenue sync
            await tx.paymentrecord.create({
                data: {
                    transactionId: `TXN${Math.floor(100000000 + Math.random() * 900000000)}`,
                    date: new Date(),
                    customer: company.name,
                    paymentMethod: paymentMethod || 'Subscription Renewal',
                    amount: amount,
                    status: 'Success'
                }
            });

            // Update Company dates and planType
            const updatedCompany = await tx.company.update({
                where: { id: company.id },
                data: {
                    planId: plan ? plan.id : company.planId,
                    planName: plan ? plan.name : company.planName,
                    planType: cycle,
                    startDate: newStart,
                    endDate: newEnd
                },
                include: { plan: true }
            });

            return { newSub, updatedCompany };
        });

        // Clear in-memory expiry cache for this company
        clearCompanyExpiryCache(companyId);

        res.json({
            message: 'Subscription renewed successfully!',
            subscription: result.newSub,
            company: result.updatedCompany,
            isExpired: false,
            status: 'ACTIVE'
        });
    } catch (error) {
        console.error('renewSubscription error:', error);
        res.status(500).json({ message: 'Failed to renew subscription', error: error.message });
    }
};

// POST /api/company/subscription/upgrade
const upgradeSubscription = async (req, res) => {
    try {
        const companyId = parseInt(req.user?.companyId);
        if (!companyId) {
            return res.status(400).json({ message: 'Company ID not found in token' });
        }

        const { planId, billingCycle, paymentMethod } = req.body;
        if (!planId) {
            return res.status(400).json({ message: 'Target planId is required' });
        }

        const targetPlan = await prisma.plan.findUnique({
            where: { id: parseInt(planId) }
        });

        if (!targetPlan) {
            return res.status(404).json({ message: 'Target plan not found' });
        }

        const company = await prisma.company.findUnique({
            where: { id: companyId }
        });

        if (!company) {
            return res.status(404).json({ message: 'Company not found' });
        }

        const cycle = billingCycle || 'Monthly';
        const newStart = new Date();
        let newEnd = new Date();

        if (cycle === 'Yearly') {
            newEnd.setFullYear(newEnd.getFullYear() + 1);
        } else {
            newEnd.setMonth(newEnd.getMonth() + 1);
        }

        let amount = parseFloat(targetPlan.totalPrice || targetPlan.basePrice || 0);
        if (cycle === 'Yearly') {
            amount = amount * 12;
        }

        const paymentRef = `UPG-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Execute upgrade transaction
        const result = await prisma.$transaction(async (tx) => {
            // Update previous subscriptions to EXPIRED
            await tx.subscription.updateMany({
                where: { companyId, status: 'ACTIVE' },
                data: { status: 'EXPIRED' }
            });

            // Create new ACTIVE subscription
            const newSub = await tx.subscription.create({
                data: {
                    companyId: company.id,
                    planId: targetPlan.id,
                    startDate: newStart,
                    expiryDate: newEnd,
                    billingCycle: cycle,
                    amount: amount,
                    status: 'ACTIVE',
                    paymentReference: paymentRef
                }
            });

            // Create payment record
            await tx.paymentrecord.create({
                data: {
                    transactionId: `TXN${Math.floor(100000000 + Math.random() * 900000000)}`,
                    date: new Date(),
                    customer: company.name,
                    paymentMethod: paymentMethod || 'Plan Upgrade',
                    amount: amount,
                    status: 'Success'
                }
            });

            // Update Company record
            const updatedCompany = await tx.company.update({
                where: { id: company.id },
                data: {
                    planId: targetPlan.id,
                    planName: targetPlan.name,
                    planType: cycle,
                    startDate: newStart,
                    endDate: newEnd
                },
                include: { plan: true }
            });

            // Update default COMPANY role permissions based on upgraded plan modules
            if (targetPlan.modules) {
                const newPermissions = deriveCompanyPermissions(targetPlan.modules);
                await tx.role.updateMany({
                    where: { companyId: company.id, name: 'COMPANY' },
                    data: { permissions: JSON.stringify(newPermissions) }
                });
            }

            return { newSub, updatedCompany };
        });

        // Clear expiry cache
        clearCompanyExpiryCache(companyId);

        res.json({
            message: `Successfully upgraded to ${targetPlan.name}!`,
            subscription: result.newSub,
            company: result.updatedCompany,
            isExpired: false,
            status: 'ACTIVE'
        });
    } catch (error) {
        console.error('upgradeSubscription error:', error);
        res.status(500).json({ message: 'Failed to upgrade plan', error: error.message });
    }
};

module.exports = {
    getSubscriptionStatus,
    getSubscriptionHistory,
    getAvailablePlans,
    renewSubscription,
    upgradeSubscription
};
