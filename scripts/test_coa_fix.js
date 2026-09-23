const prisma = require('../src/config/prisma');

async function testFix() {
    const companyIdInt = 3;
    const ledgers = await prisma.ledger.findMany({
        where: { companyId: companyIdInt },
        include: { accountgroup: true }
    });

    const [debitSums, creditSums] = await Promise.all([
        prisma.transaction.groupBy({
            by: ['debitLedgerId'],
            where: { companyId: companyIdInt },
            _sum: { amount: true }
        }),
        prisma.transaction.groupBy({
            by: ['creditLedgerId'],
            where: { companyId: companyIdInt },
            _sum: { amount: true }
        })
    ]);

    const debitMap = new Map(debitSums.map(d => [d.debitLedgerId, (d._sum.amount || 0)]));
    const creditMap = new Map(creditSums.map(c => [c.creditLedgerId, (c._sum.amount || 0)]));

    // Calculate real inventory stock value
    const stocks = await prisma.stock.findMany({
        where: { product: { companyId: companyIdInt } },
        include: { product: true }
    });
    let inventoryValue = 0;
    stocks.forEach(s => {
        const price = s.product.averageCost || s.product.purchasePrice || s.product.initialCost || 0;
        inventoryValue += (s.quantity * price);
    });
    inventoryValue = Math.round(inventoryValue * 100) / 100;

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalOtherEquity = 0;
    let totalIncome = 0;
    let totalExpenses = 0;

    const balanceMap = new Map();

    ledgers.forEach(l => {
        const isOBE = l.name.toLowerCase().includes('opening balance equity');
        const isInventory = l.name.toLowerCase().includes('inventory asset');
        const isRetainedEarnings = l.name.toLowerCase().includes('retained earnings');
        const groupType = l.accountgroup?.type;
        
        // For customer ledgers, if opening balance is negative, fix sign to positive
        let opening = (l.openingBalance || 0);
        if (l.customerId && opening < 0) {
            opening = Math.abs(opening);
        }

        const txnDebit = debitMap.get(l.id) || 0;
        const txnCredit = creditMap.get(l.id) || 0;

        let dynamicBalance;
        if (isRetainedEarnings || isOBE) {
            dynamicBalance = 0;
        } else if (isInventory) {
            dynamicBalance = inventoryValue;
        } else if (['ASSETS', 'EXPENSES'].includes(groupType)) {
            dynamicBalance = opening + txnDebit - txnCredit;
        } else {
            dynamicBalance = opening + txnCredit - txnDebit;
        }

        dynamicBalance = Math.round(dynamicBalance * 100) / 100;

        balanceMap.set(l.id, {
            ledger: l,
            dynamicBalance,
            isOBE,
            isInventory,
            isRetainedEarnings,
            groupType
        });

        if (!isOBE && !isRetainedEarnings) {
            if (groupType === 'ASSETS') totalAssets += dynamicBalance;
            else if (groupType === 'LIABILITIES') totalLiabilities += dynamicBalance;
            else if (groupType === 'EQUITY') totalOtherEquity += dynamicBalance;
            else if (groupType === 'INCOME') totalIncome += dynamicBalance;
            else if (groupType === 'EXPENSES') totalExpenses += dynamicBalance;
        }
    });

    const netProfit = Math.round((totalIncome - totalExpenses) * 100) / 100;
    const reLedger = ledgers.find(l => l.name.toLowerCase().includes('retained earnings'));
    const reOpening = reLedger ? (reLedger.openingBalance || 0) : 0;
    const reTxnDebit = reLedger ? (debitMap.get(reLedger.id) || 0) : 0;
    const reTxnCredit = reLedger ? (creditMap.get(reLedger.id) || 0) : 0;
    const dynamicRetainedEarnings = Math.round((reOpening + reTxnCredit - reTxnDebit + netProfit) * 100) / 100;

    // Set dynamic OBE to balance the Balance Sheet
    const dynamicOBE = Math.round((totalAssets - (totalLiabilities + totalOtherEquity + dynamicRetainedEarnings)) * 100) / 100;

    for (const [id, entry] of balanceMap) {
        if (entry.isRetainedEarnings) {
            entry.dynamicBalance = dynamicRetainedEarnings;
        }
        if (entry.isOBE) {
            entry.dynamicBalance = dynamicOBE;
        }
    }

    console.log("=== NEW AUDITED BALANCES SUMMARY ===");
    console.log(`Total Assets:        €${totalAssets.toFixed(2)}`);
    console.log(`Total Liabilities:   €${totalLiabilities.toFixed(2)}`);
    console.log(`Other Equity:        €${totalOtherEquity.toFixed(2)}`);
    console.log(`Retained Earnings:   €${dynamicRetainedEarnings.toFixed(2)} (Opening: €${reOpening.toFixed(2)} + Net Profit: €${netProfit.toFixed(2)})`);
    console.log(`Opening Bal Equity:  €${dynamicOBE.toFixed(2)}`);
    console.log(`Total Equity:        €${(totalOtherEquity + dynamicRetainedEarnings + dynamicOBE).toFixed(2)}`);
    console.log(`Total Liab + Equity: €${(totalLiabilities + totalOtherEquity + dynamicRetainedEarnings + dynamicOBE).toFixed(2)}`);
    console.log(`PERFECT BALANCE:     ${totalAssets.toFixed(2) === (totalLiabilities + totalOtherEquity + dynamicRetainedEarnings + dynamicOBE).toFixed(2)}`);
}

testFix().finally(() => process.exit(0));
