const prisma = require('../src/config/prisma');
const chartOfAccountsService = require('../src/services/chartOfAccountsService');

async function main() {
    const coaData = await chartOfAccountsService.getChartOfAccounts(3);
    
    console.log("=== COMPLETE COA BREAKDOWN BY GROUP ===");
    for (const group of coaData) {
        console.log(`\n================== ${group.name} (${group.type}) ==================`);
        
        if (group.ledger && group.ledger.length > 0) {
            console.log(`-- Direct Ledgers under ${group.name} --`);
            for (const l of group.ledger) {
                console.log(`[${l.id}] ${l.name}: CurrentBalance=${l.currentBalance}, Opening=${l.openingBalance}`);
            }
        }
        
        if (group.accountsubgroup) {
            for (const sub of group.accountsubgroup) {
                if (sub.ledger && sub.ledger.length > 0) {
                    console.log(`-- Subgroup: ${sub.name} --`);
                    for (const l of sub.ledger) {
                        console.log(`  [${l.id}] ${l.name}: CurrentBalance=${l.currentBalance}, Opening=${l.openingBalance}`);
                    }
                }
            }
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
