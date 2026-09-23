const prisma = require('../src/config/prisma');
const chartOfAccountsService = require('../src/services/chartOfAccountsService');

async function main() {
    console.log("===============================================================================");
    console.log("DETAILED AUDIT OF EVERY VISIBLE NUMBER IN CHART OF ACCOUNTS (CEAC LTD - ID: 3)");
    console.log("===============================================================================\n");

    const coa = await chartOfAccountsService.getChartOfAccounts(3);
    const company = await prisma.company.findUnique({ where: { id: 3 } });

    // 1. Gather all ledgers
    const ledgerList = [];
    coa.forEach(group => {
        (group.ledger || []).forEach(l => {
            ledgerList.push({ ...l, groupType: group.type, groupName: group.name, subGroupName: 'None' });
        });
        (group.accountsubgroup || []).forEach(sub => {
            (sub.ledger || []).forEach(l => {
                ledgerList.push({ ...l, groupType: group.type, groupName: group.name, subGroupName: sub.name });
            });
        });
    });

    console.log(`Total Ledgers: ${ledgerList.length}\n`);

    // 2. Audit each group
    const groups = ['ASSETS', 'LIABILITIES', 'EQUITY', 'INCOME', 'EXPENSES'];

    for (const gType of groups) {
        console.log(`\n===============================================================================`);
        console.log(`GROUP: ${gType}`);
        console.log(`===============================================================================`);
        
        const groupLedgers = ledgerList.filter(l => l.groupType === gType);
        
        for (const l of groupLedgers) {
            // Find all transactions for this ledger
            const debits = await prisma.transaction.findMany({
                where: { companyId: 3, debitLedgerId: l.id },
                select: { id: true, amount: true, voucherType: true, voucherNumber: true, narration: true, date: true }
            });
            const credits = await prisma.transaction.findMany({
                where: { companyId: 3, creditLedgerId: l.id },
                select: { id: true, amount: true, voucherType: true, voucherNumber: true, narration: true, date: true }
            });

            const totalDr = debits.reduce((s, t) => s + (t.amount || 0), 0);
            const totalCr = credits.reduce((s, t) => s + (t.amount || 0), 0);
            const opening = l.openingBalance || 0;

            let expectedBal = 0;
            if (['ASSETS', 'EXPENSES'].includes(gType)) {
                expectedBal = opening + totalDr - totalCr;
            } else {
                expectedBal = opening + totalCr - totalDr;
            }

            const visibleBal = l.currentBalance;
            const diff = Math.abs(visibleBal - expectedBal);

            let status = 'OK';
            const notes = [];

            if (diff > 0.01) {
                status = 'MISMATCH';
                notes.push(`Dynamic Balance (${visibleBal}) differs from formula Opening + Txns (${expectedBal})`);
            }

            // Accounting rule checks:
            if (gType === 'ASSETS') {
                if (visibleBal < 0) {
                    notes.push(`NEGATIVE ASSET: Normal balance is Debit (positive). Negative balance means credits exceed debits (e.g. overpayment/advance receipt, or credit posted without invoice).`);
                }
            } else if (gType === 'LIABILITIES') {
                if (visibleBal < 0) {
                    notes.push(`NEGATIVE LIABILITY: Normal balance is Credit (positive). Negative balance means debit exceeds credit (e.g. overpaid vendor).`);
                }
            } else if (gType === 'EXPENSES') {
                if (visibleBal < 0) {
                    notes.push(`NEGATIVE EXPENSE: Normal balance is Debit (positive). Credit entries exceed debits!`);
                }
            } else if (gType === 'INCOME') {
                if (visibleBal < 0) {
                    notes.push(`NEGATIVE INCOME: Normal balance is Credit (positive). Debit entries exceed credits!`);
                }
            }

            console.log(`\n[#${l.id}] ${l.name} | Subgroup: ${l.subGroupName}`);
            console.log(`   Visible Balance: €${Number(visibleBal).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
            console.log(`   Formula Check: Opening (€${opening}) + Dr (€${totalDr}) - Cr (€${totalCr}) = €${expectedBal}`);
            console.log(`   Transactions: ${debits.length} Debits, ${credits.length} Credits`);
            if (notes.length > 0) {
                console.log(`   ⚠️ AUDIT NOTES:`);
                notes.forEach(n => console.log(`      - ${n}`));
            }

            // Print transaction sample if negative or anomalous
            if (visibleBal < 0 || notes.length > 0) {
                if (debits.length > 0) console.log(`      Sample Debits:`, debits.slice(0, 3).map(d => `${d.voucherType}: €${d.amount} (${d.narration})`));
                if (credits.length > 0) console.log(`      Sample Credits:`, credits.slice(0, 3).map(c => `${c.voucherType}: €${c.amount} (${c.narration})`));
            }
        }
    }
}

main().finally(() => process.exit(0));
