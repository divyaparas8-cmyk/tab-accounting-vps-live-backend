const prisma = require('../src/config/prisma');

async function testDeptPnl() {
    const companyId = 3;
    
    // Official P&L figures for reference:
    // Total Income: €707,601.76
    // Total Expenses: €544,349.18 (COGS: €447,607.65 + Operating: €96,741.53)
    // Net Profit: €163,252.58

    const [invoices, posInvoices, bills, transactions] = await Promise.all([
        prisma.invoice.findMany({ where: { companyId }, include: { invoiceitem: { include: { product: true } } } }),
        prisma.posinvoice.findMany({ where: { companyId }, include: { posinvoiceitem: { include: { product: true } } } }),
        prisma.purchasebill.findMany({ where: { companyId } }),
        prisma.transaction.findMany({
            where: { companyId },
            include: {
                ledger_transaction_debitLedgerIdToledger: { include: { accountgroup: true } },
                ledger_transaction_creditLedgerIdToledger: { include: { accountgroup: true } }
            }
        })
    ]);

    // Let's examine all expense transactions that are NOT COGS
    let cogsTxnsSum = 0;
    let otherExpTxnsSum = 0;
    transactions.forEach(tx => {
        const debitLedger = tx.ledger_transaction_debitLedgerIdToledger;
        if (debitLedger?.accountgroup?.type === 'EXPENSES') {
            const isCogs = debitLedger.name.toLowerCase().includes('cost of goods') ||
                           tx.voucherNumber?.startsWith('COGS') ||
                           tx.narration?.toLowerCase().includes('cogs');
            if (isCogs) {
                cogsTxnsSum += tx.amount;
            } else {
                otherExpTxnsSum += tx.amount;
                console.log(`Other Expense: [${tx.voucherType}] ${debitLedger.name}: €${tx.amount} (${tx.narration})`);
            }
        }
    });

    console.log(`\nCOGS transactions sum: €${cogsTxnsSum.toFixed(2)}`);
    console.log(`Other Operating Expenses sum: €${otherExpTxnsSum.toFixed(2)}`);
}

testDeptPnl().finally(() => process.exit(0));
