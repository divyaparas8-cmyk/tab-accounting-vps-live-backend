const prisma = require('../config/prisma');

/**
 * Get paginated and filtered audit logs for the authenticated user's company.
 * Fully supports individual invoices, combined invoices (with all child invoices and payments),
 * POS invoices, receipts, and keyword search without filter clobbering.
 */
const getAuditLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            action,
            entity,
            entityType,
            entityId,
            invoiceId,
            customerId,
            userId,
            startDate,
            endDate,
            search,
            companyId
        } = req.query;

        const userRole = req.user?.role?.toUpperCase();
        const requestedCompanyId = (companyId || req.query.companyId) ? parseInt(companyId || req.query.companyId, 10) : null;
        const userCompanyId = req.user?.companyId ? parseInt(req.user.companyId, 10) : null;

        const where = {};
        const andConditions = [];

        let activeCompanyId = null;
        if (userRole === 'SUPERADMIN') {
            if (requestedCompanyId) {
                where.companyId = requestedCompanyId;
                activeCompanyId = requestedCompanyId;
            } else if (userCompanyId) {
                where.companyId = userCompanyId;
                activeCompanyId = userCompanyId;
            }
            // If neither, superadmin sees logs across all companies
        } else {
            activeCompanyId = requestedCompanyId || userCompanyId;
            if (!activeCompanyId) {
                return res.status(400).json({ message: 'Company ID is required' });
            }
            where.companyId = activeCompanyId;
        }

        if (action && typeof action === 'string' && action.trim()) {
            where.action = action.trim();
        }

        if (userId) {
            const parsedUserId = parseInt(userId, 10);
            if (!isNaN(parsedUserId)) {
                where.userId = parsedUserId;
            }
        }

        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                const start = new Date(startDate);
                if (!isNaN(start.getTime())) {
                    where.createdAt.gte = start;
                }
            }
            if (endDate) {
                const end = new Date(endDate);
                if (!isNaN(end.getTime())) {
                    end.setHours(23, 59, 59, 999);
                    where.createdAt.lte = end;
                }
            }
            if (Object.keys(where.createdAt).length === 0) {
                delete where.createdAt;
            }
        }

        const targetEntity = entity || entityType || req.query.entityType;
        const targetEntityId = entityId || invoiceId;
        const companyScope = activeCompanyId ? { companyId: activeCompanyId } : {};

        // 1. Resolve Combined Invoice or Specific Invoice filtering
        if (targetEntityId !== undefined && targetEntityId !== null && String(targetEntityId).trim()) {
            const rawTarget = String(targetEntityId).trim();
            const lowerTarget = rawTarget.toLowerCase();
            const isCombined = lowerTarget.startsWith('combined-') || lowerTarget.includes('combined') || req.query.isCombined === 'true';

            if (isCombined) {
                // Extract customer ID from query or string (e.g. combined-CUST-29 or combined-29)
                let custId = customerId ? parseInt(customerId, 10) : null;
                if (!custId) {
                    const match = rawTarget.match(/cust-(\d+)/i) || rawTarget.match(/combined-(\d+)/i);
                    if (match) custId = parseInt(match[1], 10);
                }

                const orConditions = [
                    { details: { contains: rawTarget } },
                    { details: { contains: lowerTarget } },
                    { details: { contains: rawTarget.toUpperCase() } }
                ];

                if (custId && !isNaN(custId)) {
                    orConditions.push(
                        { details: { contains: `combined-CUST-${custId}` } },
                        { details: { contains: `COMBINED-CUST-${custId}` } },
                        { details: { contains: `"customerId":${custId}` } },
                        { details: { contains: `"customerId": ${custId}` } },
                        { details: { contains: `Customer ID ${custId}` } },
                        { details: { contains: `Customer #${custId}` } }
                    );

                    // Fetch all invoices, posinvoices and receipts belonging to this customer
                    const [custInvoices, custPosInvoices, custReceipts] = await Promise.all([
                        prisma.invoice.findMany({
                            where: { customerId: custId, ...companyScope },
                            select: { id: true, invoiceNumber: true }
                        }),
                        prisma.posinvoice.findMany({
                            where: { customerId: custId, ...companyScope },
                            select: { id: true, invoiceNumber: true }
                        }),
                        prisma.receipt.findMany({
                            where: { customerId: custId, ...companyScope },
                            select: { id: true, receiptNumber: true }
                        })
                    ]);

                    const invIds = custInvoices.map(i => i.id);
                    const posIds = custPosInvoices.map(p => p.id);
                    const recIds = custReceipts.map(r => r.id);
                    const invNums = [...custInvoices.map(i => i.invoiceNumber), ...custPosInvoices.map(p => p.invoiceNumber)].filter(Boolean);
                    const recNums = custReceipts.map(r => r.receiptNumber).filter(Boolean);

                    if (invIds.length > 0) {
                        orConditions.push({
                            entity: { in: ['Invoice', 'Sales Invoice'] },
                            entityId: { in: invIds }
                        });
                    }
                    if (posIds.length > 0) {
                        orConditions.push({
                            entity: { in: ['POS', 'POS Invoice', 'posinvoice'] },
                            entityId: { in: posIds }
                        });
                    }
                    if (recIds.length > 0) {
                        orConditions.push({
                            entity: { in: ['Receipt', 'Sales Receipt', 'Payment'] },
                            entityId: { in: recIds }
                        });
                    }

                    invNums.forEach(num => {
                        orConditions.push({ details: { contains: num } });
                    });
                    recNums.forEach(num => {
                        orConditions.push({ details: { contains: num } });
                    });
                }

                andConditions.push({ OR: orConditions });
            } else if (targetEntity === 'Invoice' || targetEntity === 'Sales Invoice' || targetEntity === 'POS' || !targetEntity) {
                // Individual Invoice or POS Invoice
                const parsedTargetNum = parseInt(rawTarget, 10);
                const isNumeric = !isNaN(parsedTargetNum) && String(parsedTargetNum) === rawTarget;

                // Lookup invoice in DB to get full relationships (allocations, receipts)
                let inv = null;
                if (isNumeric) {
                    inv = await prisma.invoice.findFirst({
                        where: { id: parsedTargetNum, ...companyScope },
                        include: {
                            allocations: {
                                include: { receipt: { select: { id: true, receiptNumber: true } } }
                            }
                        }
                    });
                    if (!inv) {
                        // Check POS invoice table
                        inv = await prisma.posinvoice.findFirst({
                            where: { id: parsedTargetNum, ...companyScope },
                            include: {
                                allocations: {
                                    include: { receipt: { select: { id: true, receiptNumber: true } } }
                                }
                            }
                        });
                    }
                } else {
                    inv = await prisma.invoice.findFirst({
                        where: { invoiceNumber: rawTarget, ...companyScope },
                        include: {
                            allocations: {
                                include: { receipt: { select: { id: true, receiptNumber: true } } }
                            }
                        }
                    });
                    if (!inv) {
                        inv = await prisma.posinvoice.findFirst({
                            where: { invoiceNumber: rawTarget, ...companyScope },
                            include: {
                                allocations: {
                                    include: { receipt: { select: { id: true, receiptNumber: true } } }
                                }
                            }
                        });
                    }
                }

                const orConditions = [
                    { details: { contains: rawTarget } }
                ];

                if (isNumeric) {
                    orConditions.push({ entityId: parsedTargetNum });
                }

                if (inv) {
                    orConditions.push(
                        { entityId: inv.id },
                        { details: { contains: inv.invoiceNumber } },
                        { details: { contains: `"invoiceId":${inv.id}` } },
                        { details: { contains: `"invoiceId": ${inv.id}` } }
                    );

                    const recIds = (inv.allocations || []).map(a => a.receipt?.id).filter(Boolean);
                    const recNums = (inv.allocations || []).map(a => a.receipt?.receiptNumber).filter(Boolean);

                    if (recIds.length > 0) {
                        orConditions.push({
                            entity: { in: ['Receipt', 'Sales Receipt', 'Payment'] },
                            entityId: { in: recIds }
                        });
                    }
                    recNums.forEach(num => {
                        orConditions.push({ details: { contains: num } });
                    });
                }

                andConditions.push({ OR: orConditions });
            } else {
                // Non-invoice entity (e.g. PurchaseBill, Customer, Vendor, Product)
                if (targetEntity && typeof targetEntity === 'string' && targetEntity.trim()) {
                    where.entity = targetEntity.trim();
                }
                const parsedTargetNum = parseInt(rawTarget, 10);
                if (!isNaN(parsedTargetNum) && String(parsedTargetNum) === rawTarget) {
                    where.entityId = parsedTargetNum;
                } else {
                    where.details = { contains: rawTarget };
                }
            }
        } else if (targetEntity && typeof targetEntity === 'string' && targetEntity.trim()) {
            where.entity = targetEntity.trim();
        }

        // 2. Keyword Search
        if (search && typeof search === 'string' && search.trim()) {
            const trimmedSearch = search.trim();
            const searchConditions = [
                { userName: { contains: trimmedSearch } },
                { userEmail: { contains: trimmedSearch } },
                { details: { contains: trimmedSearch } }
            ];
            const parsedNum = parseInt(trimmedSearch, 10);
            if (!isNaN(parsedNum) && String(parsedNum) === trimmedSearch) {
                searchConditions.push({ entityId: parsedNum });
            }
            andConditions.push({ OR: searchConditions });
        }

        if (andConditions.length > 0) {
            where.AND = andConditions;
        }

        const isExportAll = req.query.all === 'true' || req.query.limit === 'all' || req.query.limit === '-1';

        const parsedPage = isExportAll ? 1 : Math.max(1, parseInt(page, 10) || 1);
        const parsedLimit = isExportAll ? undefined : Math.max(1, Math.min(1000, parseInt(limit, 10) || 20));
        const skip = isExportAll ? undefined : (parsedPage - 1) * parsedLimit;
        const take = isExportAll ? undefined : parsedLimit;

        const [logs, total] = await Promise.all([
            prisma.auditlog.findMany({
                where,
                orderBy: {
                    createdAt: 'desc'
                },
                ...(skip !== undefined ? { skip } : {}),
                ...(take !== undefined ? { take } : {}),
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true
                        }
                    },
                    company: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                }
            }),
            prisma.auditlog.count({ where })
        ]);

        res.status(200).json({
            logs,
            pagination: {
                total,
                page: parsedPage,
                limit: isExportAll ? total : parsedLimit,
                totalPages: isExportAll ? 1 : (Math.ceil(total / parsedLimit) || 1)
            }
        });
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
};

module.exports = { getAuditLogs };

