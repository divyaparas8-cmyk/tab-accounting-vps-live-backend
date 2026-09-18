const prisma = require('../config/prisma');

const createPlan = async (req, res) => {
    try {
        const {
            name,
            basePrice,
            currency,
            invoiceLimit,
            additionalInvoicePrice,
            userLimit,
            storageCapacity,
            billingCycle,
            status,
            modules,
            totalPrice,
            descriptions
        } = req.body;

        const plan = await prisma.plan.create({
            data: {
                name,
                basePrice: parseFloat(basePrice) || 0,
                currency: currency || 'EUR',
                invoiceLimit,
                additionalInvoicePrice: parseFloat(additionalInvoicePrice) || 0,
                userLimit,
                storageCapacity,
                billingCycle,
                status,
                modules: modules ? (typeof modules === 'object' ? JSON.stringify(modules) : modules) : "[]",
                totalPrice: parseFloat(totalPrice) || 0,
                descriptions: descriptions ? (typeof descriptions === 'object' ? JSON.stringify(descriptions) : descriptions) : "[]"
            }
        });

        res.status(201).json(plan);
    } catch (error) {
        console.error('Create Plan Error:', error);
        res.status(500).json({ error: error.message });
    }
};

const derivePermissionsFromModules = (modulesData) => {
    let modulesArray = [];
    try {
        if (typeof modulesData === 'string') {
            modulesArray = JSON.parse(modulesData);
        } else if (Array.isArray(modulesData)) {
            modulesArray = modulesData;
        }
    } catch (e) {
        console.error("Module parse error:", e);
    }

    const enabledModules = modulesArray.filter(m => m.enabled).map(m => (m.name || m.module_name || "").toLowerCase());

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

const getPlans = async (req, res) => {
    try {
        const plans = await prisma.plan.findMany({
            include: {
                _count: {
                    select: { company: true }
                }
            }
        });

        // Parse JSON fields and format subscriber counts for both frontend property styles
        const parsedPlans = plans.map(plan => {
            const count = plan._count?.company || 0;
            return {
                ...plan,
                _count: {
                    company: count,
                    companies: count
                },
                subscribersCount: count,
                modules: plan.modules ? JSON.parse(plan.modules) : [],
                descriptions: plan.descriptions ? JSON.parse(plan.descriptions) : []
            };
        });

        res.json(parsedPlans);
    } catch (error) {
        console.error('Get Plans Error:', error);
        res.status(500).json({ error: error.message });
    }
};

const getPlanById = async (req, res) => {
    try {
        const plan = await prisma.plan.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                _count: {
                    select: { company: true }
                }
            }
        });
        if (!plan) return res.status(404).json({ message: 'Plan not found' });

        const count = plan._count?.company || 0;
        // Parse JSON fields
        const parsedPlan = {
            ...plan,
            _count: {
                company: count,
                companies: count
            },
            subscribersCount: count,
            modules: plan.modules ? JSON.parse(plan.modules) : [],
            descriptions: plan.descriptions ? JSON.parse(plan.descriptions) : []
        };

        res.json(parsedPlan);
    } catch (error) {
        console.error('Get Plan By ID Error:', error);
        res.status(500).json({ error: error.message });
    }
};

const updatePlan = async (req, res) => {
    try {
        const planId = parseInt(req.params.id);
        const {
            name,
            basePrice,
            currency,
            invoiceLimit,
            additionalInvoicePrice,
            userLimit,
            storageCapacity,
            billingCycle,
            status,
            modules,
            totalPrice,
            descriptions
        } = req.body;

        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (basePrice !== undefined) updateData.basePrice = parseFloat(basePrice) || 0;
        if (currency !== undefined) updateData.currency = currency;
        if (invoiceLimit !== undefined) updateData.invoiceLimit = invoiceLimit;
        if (additionalInvoicePrice !== undefined) updateData.additionalInvoicePrice = parseFloat(additionalInvoicePrice) || 0;
        if (userLimit !== undefined) updateData.userLimit = userLimit;
        if (storageCapacity !== undefined) updateData.storageCapacity = storageCapacity;
        if (billingCycle !== undefined) updateData.billingCycle = billingCycle;
        if (status !== undefined) updateData.status = status;
        if (modules !== undefined) {
            updateData.modules = typeof modules === 'object' ? JSON.stringify(modules) : modules;
        }
        if (totalPrice !== undefined) updateData.totalPrice = parseFloat(totalPrice) || 0;
        if (descriptions !== undefined) {
            updateData.descriptions = typeof descriptions === 'object' ? JSON.stringify(descriptions) : descriptions;
        }

        const plan = await prisma.plan.update({
            where: { id: planId },
            data: updateData,
            include: {
                _count: {
                    select: { company: true }
                }
            }
        });

        // Synchronize companies subscribed to this plan
        if (name) {
            await prisma.company.updateMany({
                where: { planId },
                data: { planName: name }
            });
        }

        // If modules updated, synchronize role permissions for subscribed companies
        if (modules !== undefined) {
            try {
                const newPermissions = derivePermissionsFromModules(modules);
                const companies = await prisma.company.findMany({
                    where: { planId },
                    select: { id: true }
                });
                const companyIds = companies.map(c => c.id);
                if (companyIds.length > 0) {
                    await prisma.role.updateMany({
                        where: {
                            companyId: { in: companyIds },
                            name: 'COMPANY'
                        },
                        data: {
                            permissions: JSON.stringify(newPermissions)
                        }
                    });
                }
            } catch (permErr) {
                console.error('Error synchronizing company role permissions on plan update:', permErr);
            }
        }

        const count = plan._count?.company || 0;
        const parsedPlan = {
            ...plan,
            _count: {
                company: count,
                companies: count
            },
            subscribersCount: count,
            modules: plan.modules ? JSON.parse(plan.modules) : [],
            descriptions: plan.descriptions ? JSON.parse(plan.descriptions) : []
        };

        res.json(parsedPlan);
    } catch (error) {
        console.error('Update Plan Error:', error);
        res.status(500).json({ error: error.message });
    }
};

const deletePlan = async (req, res) => {
    try {
        await prisma.plan.delete({
            where: { id: parseInt(req.params.id) }
        });
        res.json({ message: 'Plan deleted successfully' });
    } catch (error) {
        console.error('Delete Plan Error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    createPlan,
    getPlans,
    getPlanById,
    updatePlan,
    deletePlan
};
