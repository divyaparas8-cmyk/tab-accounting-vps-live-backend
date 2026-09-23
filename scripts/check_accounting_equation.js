const prisma = require('../src/config/prisma');
const chartOfAccountsService = require('../src/services/chartOfAccountsService');

async function main() {
    const coa = await chartOfAccountsService.getChartOfAccounts(3);

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let totalIncome = 0;
    let totalExpenses = 0;

    const list = [];
    coa.forEach(g => {
        (g.ledger || []).forEach(l => list.push({ ...l, groupType: g.type }));
        (g.accountsubgroup || []).forEach(s => {
            (s.ledger || []).forEach(l => list.push({ ...l, groupType: g.type }));
        });
    });

    list.forEach(l => {
        if (l.groupType === 'ASSETS') totalAssets += l.currentBalance;
        if (l.groupType === 'LIABILITIES') totalLiabilities += l.currentBalance;
        if (l.groupType === 'EQUITY') totalEquity += l.currentBalance;
        if (l.groupType === 'INCOME') totalIncome += l.currentBalance;
        if (l.groupType === 'EXPENSES') totalExpenses += l.currentBalance;
    });

    console.log("=== ACCOUNTING TOTALS ===");
    console.log(`Total Assets:      €${totalAssets.toFixed(2)}`);
    console.log(`Total Liabilities: €${totalLiabilities.toFixed(2)}`);
    console.log(`Total Equity:      €${totalEquity.toFixed(2)}`);
    console.log(`Total Income:      €${totalIncome.toFixed(2)}`);
    console.log(`Total Expenses:    €${totalExpenses.toFixed(2)}`);
    console.log(`Net Profit:        €${(totalIncome - totalExpenses).toFixed(2)}`);
    console.log(`Liabilities + Equity: €${(totalLiabilities + totalEquity).toFixed(2)}`);
    console.log(`Difference (Assets - (Liabilities + Equity)): €${(totalAssets - (totalLiabilities + totalEquity)).toFixed(2)}`);
}

main().finally(() => process.exit(0));
