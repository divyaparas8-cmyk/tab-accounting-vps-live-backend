const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient({
    datasources: { db: { url: 'mysql://root@localhost:3306/tab_account' } }
});

async function main() {
    const invs = await p.invoice.findMany({
        select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, balanceAmount: true, status: true, date: true, dueDate: true, customerId: true, companyId: true },
        orderBy: { id: 'desc' },
        take: 30
    });
    console.log('Latest 30 invoices in local DB:');
    console.log(JSON.stringify(invs, null, 2));

    const cust = await p.customer.findMany({
        where: { name: { contains: 'Test' } }
    });
    console.log('Customers with Test:', JSON.stringify(cust, null, 2));
}

main().finally(() => p.$disconnect());
