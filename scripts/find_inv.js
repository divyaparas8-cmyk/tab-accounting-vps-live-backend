const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const companies = await prisma.company.findMany();
    console.log('Companies:', JSON.stringify(companies.map(c => ({ id: c.id, name: c.name })), null, 2));

    const allInvoices = await prisma.invoice.findMany({
        where: {
            OR: [
                { invoiceNumber: { contains: '1788951' } },
                { invoiceNumber: { contains: 'INV' } }
            ]
        },
        select: { id: true, invoiceNumber: true, companyId: true, customerId: true, totalAmount: true, balanceAmount: true, paidAmount: true, status: true }
    });
    console.log('Invoices matching query:', JSON.stringify(allInvoices, null, 2));

    const cust = await prisma.customer.findMany({
        where: { name: { contains: 'Testing' } }
    });
    console.log('Customers with "Testing":', JSON.stringify(cust, null, 2));
}

main().finally(() => prisma.$disconnect());
