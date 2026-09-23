const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({
    datasources: { db: { url: 'mysql://root@localhost:3306/tab_account' } }
});

async function main() {
    const invs = await p.invoice.findMany({
        where: { customerId: 15 },
        include: {
            allocations: { include: { receipt: true } },
            invoiceitem: true
        }
    });
    console.log('Customer 15 Invoices:', JSON.stringify(invs, null, 2));
}

main().finally(() => p.$disconnect());
