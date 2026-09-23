const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'mysql://root@localhost:3306/tab_account' } } });

async function main() {
    const count = await prisma.invoice.count({ where: { companyId: 3 } });
    console.log('CEAC Ltd (companyId 3) invoices in tab_account:', count);

    const invoices = await prisma.invoice.findMany({
        where: { companyId: 3 },
        select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            balanceAmount: true,
            status: true,
            dueDate: true,
            customer: { select: { name: true } },
            invoiceitem: { select: { id: true, description: true, amount: true } }
        },
        orderBy: { id: 'desc' },
        take: 5
    });

    console.log('\nTop 5 invoices in local DB:');
    invoices.forEach(inv => {
        console.log(`- ${inv.invoiceNumber} | Customer: ${inv.customer?.name} | Total: ${inv.totalAmount} | Paid: ${inv.paidAmount} | Bal: ${inv.balanceAmount} | Status: ${inv.status} | Items: ${inv.invoiceitem.length}`);
    });
}

main().finally(() => prisma.$disconnect());
