const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    try {
        const inv = await prisma.invoice.findFirst({
            where: { invoiceNumber: { contains: '1788951450266' } },
            select: { id: true, invoiceNumber: true, totalAmount: true, paidAmount: true, balanceAmount: true, status: true }
        });
        console.log('Invoice via backend prisma:', inv);
        const count = await prisma.invoice.count();
        console.log('Total invoices:', count);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await prisma.$disconnect();
    }
}
test();
