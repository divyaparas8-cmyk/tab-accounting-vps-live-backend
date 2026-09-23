const prisma = require('../src/config/prisma');

async function testDeptPnlFixed() {
    const companyId = 3;
    const companyCurrency = 'EUR';

    const [invoices, bills, posInvoices, transactions] = await Promise.all([
        prisma.invoice.findMany({
            where: { companyId },
            include: { invoiceitem: { include: { product: true } } }
        }),
        prisma.purchasebill.findMany({
            where: { companyId },
            include: { purchasebillitem: { include: { product: true } } }
        }),
        prisma.posinvoice.findMany({
            where: { companyId },
            include: { posinvoiceitem: { include: { product: true } } }
        }),
        prisma.transaction.findMany({
            where: { companyId },
            include: {
                ledger_transaction_debitLedgerIdToledger: { include: { accountgroup: true } },
                ledger_transaction_creditLedgerIdToledger: { include: { accountgroup: true } }
            }
        })
    ]);

    const operationalDepts = {
        'Sales & Invoicing': { name: 'Sales & Invoicing', code: 'SALES', revenue: 0, cogs: 0, expenses: 0, docCount: 0 },
        'Point of Sale (POS)': { name: 'Point of Sale (POS)', code: 'POS', revenue: 0, cogs: 0, expenses: 0, docCount: 0 },
        'Purchasing & Procurement': { name: 'Purchasing & Procurement', code: 'PURCHASE', revenue: 0, cogs: 0, expenses: 0, docCount: 0 },
        'General & Administration': { name: 'General & Administration', code: 'ADMIN', revenue: 0, cogs: 0, expenses: 0, docCount: 0 },
        'Finance & Treasury': { name: 'Finance & Treasury', code: 'FINANCE', revenue: 0, cogs: 0, expenses: 0, docCount: 0 }
    };

    // 1. Sales Invoices
    for (const inv of invoices) {
        const invRev = parseFloat(inv.subtotal || inv.totalAmount || 0);
        operationalDepts['Sales & Invoicing'].revenue += invRev;
        operationalDepts['Sales & Invoicing'].docCount++;

        for (const item of (inv.invoiceitem || [])) {
            const qty = parseFloat(item.quantity) || 0;
            const unitCost = parseFloat(item.product?.purchasePrice || item.product?.initialCost || 0);
            operationalDepts['Sales & Invoicing'].cogs += (qty * unitCost);
        }
    }

    // 2. POS Invoices
    for (const pos of posInvoices) {
        const posRev = parseFloat(pos.subtotal || pos.totalAmount || 0);
        operationalDepts['Point of Sale (POS)'].revenue += posRev;
        operationalDepts['Point of Sale (POS)'].docCount++;

        for (const item of (pos.posinvoiceitem || [])) {
            const qty = parseFloat(item.quantity) || 0;
            const unitCost = parseFloat(item.product?.purchasePrice || item.product?.initialCost || 0);
            operationalDepts['Point of Sale (POS)'].cogs += (qty * unitCost);
        }
    }

    // 3. Purchase Bills: Track volume as Procurement, but do NOT duplicate COGS
    for (const bill of bills) {
        operationalDepts['Purchasing & Procurement'].docCount++;
    }

    // 4. Ledger Transactions
    transactions.forEach(tx => {
        const amt = parseFloat(tx.amount || 0);
        if (amt <= 0) return;

        const debitGroup = tx.ledger_transaction_debitLedgerIdToledger?.accountgroup?.type || '';
        const creditGroup = tx.ledger_transaction_creditLedgerIdToledger?.accountgroup?.type || '';
        const debitName = (tx.ledger_transaction_debitLedgerIdToledger?.name || '').toLowerCase();
        const creditName = (tx.ledger_transaction_creditLedgerIdToledger?.name || '').toLowerCase();
        const narration = (tx.narration || '').toLowerCase();

        // Skip COGS ledger debits because COGS is already calculated per invoice above
        const isCogs = debitName.includes('cost of goods') || tx.voucherNumber?.startsWith('COGS') || narration.includes('cogs');
        if (isCogs) return;

        // Skip Sales revenue ledger credits because sales revenue is already counted per invoice above
        const isSales = creditName.includes('sales revenue') || creditName.includes('sales income') || tx.voucherType === 'SALES';

        const isFinance = debitName.includes('bank') || debitName.includes('interest') || debitName.includes('foreign exchange') || creditName.includes('foreign exchange') || narration.includes('bank');
        const isPurchasing = creditName.includes('discount received') || narration.includes('purchase');

        let targetDept = 'General & Administration';
        if (isFinance) targetDept = 'Finance & Treasury';
        else if (isPurchasing) targetDept = 'Purchasing & Procurement';

        if (creditGroup === 'INCOME') {
            if (!isSales) {
                operationalDepts[targetDept].revenue += amt;
                operationalDepts[targetDept].docCount++;
            }
        } else if (debitGroup === 'EXPENSES') {
            operationalDepts[targetDept].expenses += amt;
            operationalDepts[targetDept].docCount++;
        }
    });

    let totalRev = 0, totalCogs = 0, totalExp = 0, totalNet = 0;
    const breakdown = Object.values(operationalDepts).map(d => {
        d.grossProfit = d.revenue - d.cogs;
        d.netProfit = d.grossProfit - d.expenses;
        d.marginPct = d.revenue > 0 ? ((d.netProfit / d.revenue) * 100).toFixed(1) : (d.netProfit < 0 ? '-100.0' : '0.0');
        totalRev += d.revenue;
        totalCogs += d.cogs;
        totalExp += d.expenses;
        totalNet += d.netProfit;
        return d;
    });

    console.log("=== FIXED DEPARTMENTAL P&L BREAKDOWN ===");
    console.table(breakdown);
    console.log("\n=== TOTAL COMPANY RECONCILIATION ===");
    console.log(`Total Revenue:  €${totalRev.toFixed(2)} (Official P&L: €707,601.76)`);
    console.log(`Total COGS:     €${totalCogs.toFixed(2)} (Official P&L: €447,607.65)`);
    console.log(`Total Expenses: €${totalExp.toFixed(2)} (Official P&L: €96,741.53)`);
    console.log(`Total Net:      €${totalNet.toFixed(2)} (Official P&L: €163,252.58)`);
}

testDeptPnlFixed().finally(() => process.exit(0));
