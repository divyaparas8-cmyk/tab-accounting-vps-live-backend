const prisma = require('../src/config/prisma');
const chartOfAccountsService = require('../src/services/chartOfAccountsService');

async function main() {
    const companies = await prisma.company.findMany({ select: { id: true, name: true } });
    
    for (const c of companies) {
        console.log(`\n\n================ CHECKING COMPANY ${c.id}: ${c.name} ================`);
        try {
            const coa = await chartOfAccountsService.getChartOfAccounts(c.id);
            const accounts = [];
            coa.forEach(g => {
                (g.ledger || []).forEach(l => accounts.push({ id: l.id, name: l.name, group: g.name, bal: l.currentBalance }));
                (g.accountsubgroup || []).forEach(s => {
                    (s.ledger || []).forEach(l => accounts.push({ id: l.id, name: l.name, group: `${g.name} > ${s.name}`, bal: l.currentBalance }));
                });
            });
            console.log(`Total accounts: ${accounts.length}`);
            // Print first 10 accounts
            console.log("Sample accounts:", accounts.slice(0, 15));
        } catch (e) {
            console.log(`Error for ${c.id}:`, e.message);
        }
    }
}

main().finally(() => process.exit(0));
