/**
 * invoiceSyncHelper.js
 * Centralized business logic for invoice payment synchronization, 
 * outstanding balance calculation, and status determination across TAB ACCOUNTS.
 */

// Helper to get currency decimal places
const getDecimalPlaces = (currency) => {
    const threeDecimalCurrencies = ['KWD', 'BHD', 'OMR', 'JOD', 'LYD', 'TND'];
    return threeDecimalCurrencies.includes(currency?.toUpperCase()) ? 3 : 2;
};

// Round value to specified decimal places
const roundTo = (val, decimals = 2) => {
    const factor = Math.pow(10, decimals);
    return Math.round((parseFloat(val) || 0) * factor) / factor;
};

/**
 * Checks if the invoice due date has passed.
 * Compares by start of calendar day: true if current day is strictly after due date day.
 */
const isDuePassed = (dueDate) => {
    if (!dueDate) return false;
    const due = new Date(dueDate);
    if (isNaN(due.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(due);
    d.setHours(0, 0, 0, 0);
    return today.getTime() > d.getTime();
};

/**
 * Computes paid amount, outstanding balance, and status based on authoritative rules:
 * - Outstanding Balance = max(0, Invoice Total - Total Payments Received)
 * - If balance <= tolerance AND (total > 0 OR paid >= total - tolerance) -> PAID
 * - If paid > tolerance AND balance > tolerance -> PARTIAL (displayed as PARTIALLY PAID)
 * - If balance <= tolerance AND total == 0 AND paid == 0 -> PAID
 * - Otherwise -> UNPAID
 * - Never mark an invoice PAID while balance > tolerance.
 */
/**
 * Computes paid amount, outstanding balance, and status based on authoritative rules:
 * - Net Total = max(0, Invoice Total - Total Returns)
 * - Outstanding Balance = max(0, Net Total - Total Payments Received)
 * - If balance <= tolerance AND (netTotal > 0 OR paid >= netTotal - tolerance) -> PAID
 * - If paid > tolerance AND balance > tolerance -> PARTIAL (displayed as PARTIALLY PAID)
 * - If balance <= tolerance AND netTotal == 0 AND paid == 0 -> PAID
 * - Otherwise -> UNPAID
 * - Never mark an invoice PAID while balance > tolerance.
 */
const computeInvoiceStatusAndBalance = (invoice, paymentsReceived = null, tolerance = null, returnedAmount = 0) => {
    if (!invoice) return invoice;

    const decimals = getDecimalPlaces(invoice.currency);
    const tol = tolerance !== null ? tolerance : (decimals === 3 ? 0.001 : 0.01);

    const originalTotal = roundTo(invoice.totalAmount || 0, decimals);
    const netTotal = Math.max(0, roundTo(originalTotal - (parseFloat(returnedAmount) || 0), decimals));
    const paid = paymentsReceived !== null 
        ? roundTo(paymentsReceived, decimals) 
        : roundTo(invoice.paidAmount || 0, decimals);
    
    // Balance cannot be negative
    const balance = Math.max(0, roundTo(netTotal - paid, decimals));

    const isPos = invoice.type === 'POS_INVOICE' || !!invoice.posinvoiceitem;
    const duePassed = isDuePassed(invoice.dueDate || invoice.date);

    let computedStatus;
    let displayStatus;

    if (invoice.status === 'CANCELLED' || invoice.status === 'Cancelled') {
        computedStatus = isPos ? 'Cancelled' : 'CANCELLED';
        displayStatus = computedStatus;
    } else if (paid > netTotal + tol) {
        // Genuine overpayment: fully settled, with credit balance
        computedStatus = isPos ? 'Paid' : 'PAID';
        displayStatus = 'OVERPAID';
    } else if (balance <= tol && (netTotal > 0 || paid >= netTotal - tol)) {
        computedStatus = isPos ? 'Paid' : 'PAID';
        displayStatus = computedStatus;
    } else if (balance <= tol && netTotal === 0 && paid === 0) {
        computedStatus = isPos ? 'Paid' : 'PAID';
        displayStatus = computedStatus;
    } else if (balance > tol && duePassed) {
        computedStatus = isPos ? 'Overdue' : 'OVERDUE';
        displayStatus = computedStatus;
    } else if (paid > tol && balance > tol) {
        computedStatus = isPos ? 'Partial' : 'PARTIAL';
        displayStatus = isPos ? 'Partially Paid' : 'PARTIALLY PAID';
    } else {
        computedStatus = isPos ? 'Due' : 'UNPAID';
        displayStatus = computedStatus;
    }

    return {
        netTotal,
        paidAmount: paid,
        balanceAmount: balance,
        status: computedStatus,
        displayStatus
    };
};

/**
 * Syncs an invoice in the database:
 * Calculates total payments received from all allocations or applies delta,
 * incorporates advance adjustments and sales returns,
 * calculates outstanding balance and status, and updates the database record.
 */
const syncInvoiceInDb = async (txOrPrisma, invoiceId, type = 'TAX_INVOICE', deltaPaid = null) => {
    if (type === 'POS_INVOICE') {
        const inv = await txOrPrisma.posinvoice.findUnique({ where: { id: parseInt(invoiceId) } });
        if (!inv) return null;

        const decimals = getDecimalPlaces(inv.currency);
        let paidAmount;
        if (deltaPaid !== null) {
            paidAmount = Math.max(0, roundTo((inv.paidAmount || 0) + deltaPaid, decimals));
        } else {
            paidAmount = roundTo(inv.paidAmount || 0, decimals);
        }

        const { balanceAmount, status } = computeInvoiceStatusAndBalance(
            inv,
            paidAmount,
            decimals === 3 ? 0.001 : 0.01
        );

        return await txOrPrisma.posinvoice.update({
            where: { id: parseInt(invoiceId) },
            data: {
                paidAmount,
                balanceAmount,
                status,
                manualStatus: false,
                updatedAt: new Date()
            }
        });
    } else {
        const parsedId = parseInt(invoiceId);
        if (isNaN(parsedId)) return null;

        const inv = await txOrPrisma.invoice.findUnique({
            where: { id: parsedId },
            include: {
                allocations: true,
                advanceadjustments: true,
                salesreturn: true
            }
        });
        if (!inv) return null;

        const decimals = getDecimalPlaces(inv.currency);
        const tol = decimals === 3 ? 0.001 : 0.01;

        // Authoritative payments received:
        let paidAmount = 0;
        let hasDirectRecords = false;

        // 1. Allocations from receipts
        if (Array.isArray(inv.allocations) && inv.allocations.length > 0) {
            hasDirectRecords = true;
            paidAmount += inv.allocations.reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
        }

        // 2. Advance adjustments (only add if not already linked via allocation receiptId)
        if (Array.isArray(inv.advanceadjustments) && inv.advanceadjustments.length > 0) {
            hasDirectRecords = true;
            const seenReceiptIdsInAllocs = new Set((inv.allocations || []).map(a => a.receiptId).filter(Boolean));
            inv.advanceadjustments.forEach(adj => {
                if (!adj.receiptId || !seenReceiptIdsInAllocs.has(adj.receiptId)) {
                    paidAmount += parseFloat(adj.amount || 0);
                }
            });
        }

        // 3. Fallbacks if no direct child allocation/advance records exist
        if (!hasDirectRecords) {
            if (deltaPaid !== null) {
                paidAmount = Math.max(0, roundTo((inv.paidAmount || 0) + deltaPaid, decimals));
            } else {
                paidAmount = roundTo(inv.paidAmount || 0, decimals);
            }
        } else {
            paidAmount = roundTo(paidAmount, decimals);
        }

        // Authoritative returns:
        let returnedTotal = 0;
        if (Array.isArray(inv.salesreturn) && inv.salesreturn.length > 0) {
            returnedTotal = inv.salesreturn.reduce((sum, ret) => {
                if (ret.status === 'Rejected') return sum;
                return sum + parseFloat(ret.totalAmount || 0);
            }, 0);
            returnedTotal = roundTo(returnedTotal, decimals);
        }

        const { balanceAmount, status } = computeInvoiceStatusAndBalance(
            inv,
            paidAmount,
            tol,
            returnedTotal
        );

        // Map to valid MySQL DB enum: UNPAID, PARTIAL, PAID, CANCELLED, COMPLETED, OVERDUE
        const dbStatus = (status === 'PARTIALLY PAID' || status === 'PARTIAL' || status === 'Partial') ? 'PARTIAL' : status;

        return await txOrPrisma.invoice.update({
            where: { id: parsedId },
            data: {
                paidAmount,
                balanceAmount,
                status: dbStatus,
                manualStatus: false,
                updatedAt: new Date()
            }
        });
    }
};

module.exports = {
    getDecimalPlaces,
    roundTo,
    isDuePassed,
    computeInvoiceStatusAndBalance,
    syncInvoiceInDb
};
