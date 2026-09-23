const prisma = require('../src/config/prisma');

async function main() {
    console.log("=== APPLYING CHART OF ACCOUNTS DATABASE CORRECTIONS FOR CEAC LTD (Company 3) ===");

    // 1. Fix Negative Customer Opening Balances
    const negativeCustLedgers = await prisma.ledger.findMany({
        where: {
            companyId: 3,
            customerId: { not: null },
            openingBalance: { lt: 0 }
        }
    });

    console.log(`\n1. Found ${negativeCustLedgers.length} customer ledgers with inverted negative opening balances.`);
    for (const l of negativeCustLedgers) {
        const positiveVal = Math.abs(l.openingBalance);
        await prisma.ledger.update({
            where: { id: l.id },
            data: { openingBalance: positiveVal }
        });
        console.log(`   - Fixed [${l.id}] ${l.name}: Opening changed from ${l.openingBalance} to +${positiveVal}`);
    }

    // 2. Clean floating point dust on zeroed accounts (Kevin, James Corcoran)
    const dustLedgers = await prisma.ledger.findMany({
        where: {
            companyId: 3,
            id: { in: [60, 66] }
        }
    });
    for (const l of dustLedgers) {
        await prisma.ledger.update({
            where: { id: l.id },
            data: { openingBalance: 0, currentBalance: 0 }
        });
        console.log(`   - Cleaned dust on [${l.id}] ${l.name}: Set to 0`);
    }

    // 3. Move negative Freight Expenses & Delivery Expenses to Income > Other Income
    // groupId: 9 (Income), subGroupId: 24 (Other Income)
    const freightLedger = await prisma.ledger.findFirst({
        where: { id: 53, companyId: 3 }
    });
    if (freightLedger) {
        await prisma.ledger.update({
            where: { id: 53 },
            data: {
                name: 'Freight & Shipping Charges Recovered',
                groupId: 9, // Income
                subGroupId: 24 // Other Income
            }
        });
        console.log(`\n2. Reclassified [53] 'Frieght Expenses' -> 'Freight & Shipping Charges Recovered' under Income > Other Income.`);
    }

    const deliveryLedger = await prisma.ledger.findFirst({
        where: { id: 54, companyId: 3 }
    });
    if (deliveryLedger) {
        await prisma.ledger.update({
            where: { id: 54 },
            data: {
                name: 'Delivery Charges Recovered',
                groupId: 9, // Income
                subGroupId: 24 // Other Income
            }
        });
        console.log(`   - Reclassified [54] 'Delivery Expenses to Customer' -> 'Delivery Charges Recovered' under Income > Other Income.`);
    }

    console.log("\n=== DATABASE CORRECTIONS APPLIED SUCCESSFULLY ===");
}

main().catch(console.error).finally(() => prisma.$disconnect());
