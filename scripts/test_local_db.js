const { PrismaClient } = require('@prisma/client');

async function testLocal() {
    const prismaLocal = new PrismaClient({
        datasources: {
            db: {
                url: "mysql://root@localhost:3306/tab_account"
            }
        }
    });

    try {
        const invs = await prismaLocal.invoice.findMany({
            where: { invoiceNumber: { contains: '1788951' } }
        });
        console.log('Local DB invs with 1788951:', JSON.stringify(invs, null, 2));

        const count = await prismaLocal.invoice.count();
        console.log('Total local invoices:', count);
    } catch (e) {
        console.log('Local DB error:', e.message);
    } finally {
        await prismaLocal.$disconnect();
    }
}

testLocal();
