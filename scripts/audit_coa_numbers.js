const prisma = require('../src/config/prisma');
const chartOfAccountsService = require('../src/services/chartOfAccountsService');

async function main() {
    console.log("=== AUDITING CHART OF ACCOUNTS FOR CEAC LTD (companyId = 3) ===");
    
    // 1. Get COA from service
    const coaData = await chartOfAccountsService.getChartOfAccounts(3);
    
    // Flatten all ledgers
    const allLedgers = [];
    coaData.forEach(group => {
        if (group.ledger) {
            group.ledger.forEach(l => {
                allLedgers.push({
                    id: l.id,
                    name: l.name,
                    group: group.name,
                    groupType: group.type,
                    subgroup: 'Direct',
                    balance: l.currentBalance,
                    openingBalance: l.openingBalance
                });
            });
        }
        if (group.accountsubgroup) {
            group.accountsubgroup.forEach(sub => {
                if (sub.ledger) {
                    sub.ledger.forEach(l => {
                        allLedgers.push({
                            id: l.id,
                            name: l.name,
                            group: group.name,
                            groupType: group.type,
                            subgroup: sub.name,
                            balance: l.currentBalance,
                            openingBalance: l.openingBalance
                        });
                    });
                }
            });
        }
    });

    console.log(`\nFound ${allLedgers.length} ledgers in COA:`);
    console.table(allLedgers.map(l => ({
        ID: l.id,
        Name: l.name.substring(0, 30),
        Group: l.group,
        Type: l.groupType,
        Subgroup: l.subgroup.substring(0, 20),
        Balance: l.balance
    })));

    // 2. Audit transactions for each ledger
    console.log("\n=== TRANSACTIONS DETAIL FOR EACH LEDGER ===");
    for (const l of allLedgers) {
        const debitTxns = await prisma.transaction.findMany({
            where: { companyId: 3, debitLedgerId: l.id },
            select: { id: true, amount: true, voucherType: true, voucherNumber: true, narration: true, date: true }
        });
        const creditTxns = await prisma.transaction.findMany({
            where: { companyId: 3, creditLedgerId: l.id },
            select: { id: true, amount: true, voucherType: true, voucherNumber: true, narration: true, date: true }
        });

        const totalDebit = debitTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
        const totalCredit = creditTxns.reduce((sum, t) => sum + (t.amount || 0), 0);

        if (debitTxns.length > 0 || creditTxns.length > 0 || l.balance !== 0) {
            console.log(`\n--- Ledger [${l.id}] ${l.name} (${l.groupType} / ${l.subgroup}) ---`);
            console.log(`Opening Balance: ${l.openingBalance}, Total Dr: ${totalDebit}, Total Cr: ${totalCredit}`);
            console.log(`Calculated Dynamic Balance: ${l.balance}`);
            console.log(`Dr Count: ${debitTxns.length}, Cr Count: ${creditTxns.length}`);
            
            if (debitTxns.length > 0) {
                console.log(`  Debits:`, debitTxns.map(t => `${t.voucherType} ${t.voucherNumber || ''}: ${t.amount} (${t.narration || ''})`));
            }
            if (creditTxns.length > 0) {
                console.log(`  Credits:`, creditTxns.map(t => `${t.voucherType} ${t.voucherNumber || ''}: ${t.amount} (${t.narration || ''})`));
            }
        }
    }

    // 3. Inventory calculation
    const inventoryVal = await chartOfAccountsService.calculateInventoryValue(3);
    console.log("\n=== INVENTORY VALUE AUDIT ===");
    console.log("Calculated inventory value from stock:", inventoryVal);
    const stocks = await prisma.stock.findMany({
        where: { product: { companyId: 3 } },
        include: { product: true }
    });
    console.table(stocks.map(s => ({
        ProductId: s.productId,
        ProductName: s.product.name,
        Quantity: s.quantity,
        AvgCost: s.product.averageCost,
        PurchasePrice: s.product.purchasePrice,
        InitialCost: s.product.initialCost,
        Value: s.quantity * (s.product.averageCost || s.product.purchasePrice || s.product.initialCost || 0)
    })));

    // 4. Retained Earnings Audit
    console.log("\n=== RETAINED EARNINGS AUDIT ===");
    // Total income vs expenses
    let totalIncome = 0;
    let totalExpenses = 0;
    allLedgers.forEach(l => {
        if (l.groupType === 'INCOME') totalIncome += l.balance;
        if (l.groupType === 'EXPENSES') totalExpenses += l.balance;
    });
    console.log(`Total Income: ${totalIncome}`);
    console.log(`Total Expenses: ${totalExpenses}`);
    console.log(`Net Profit (Income - Expenses): ${totalIncome - totalExpenses}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
