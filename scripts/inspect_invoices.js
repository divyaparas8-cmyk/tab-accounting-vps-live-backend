const prisma = require('../src/config/prisma');

async function check() {
    try {
        const invs = await prisma.invoice.findMany({
            include: {
                allocations: {
                    include: { receipt: true }
                },
                receipt: true,
                customer: { select: { id: true, name: true } }
            },
            take: 20
        });
        console.log('=== INVOICES (' + invs.length + ') ===');
        invs.forEach(inv => {
            console.log({
                id: inv.id,
                invoiceNumber: inv.invoiceNumber,
                manualReference: inv.manualReference,
                totalAmount: inv.totalAmount,
                paidAmount: inv.paidAmount,
                appliedAdvanceAmount: inv.appliedAdvanceAmount,
                balanceAmount: inv.balanceAmount,
                status: inv.status,
                customer: inv.customer?.name,
                allocationsCount: inv.allocations?.length,
                allocationsSum: inv.allocations?.reduce((s, a) => s + a.amount, 0),
                receiptsCount: inv.receipt?.length,
                receiptsSum: inv.receipt?.reduce((s, r) => s + r.amount, 0)
            });
        });

        const pos = await prisma.posinvoice.findMany({
            include: { customer: { select: { id: true, name: true } } },
            take: 10
        });
        console.log('=== POS INVOICES (' + pos.length + ') ===');
        pos.forEach(p => {
            console.log({
                id: p.id,
                invoiceNumber: p.invoiceNumber,
                totalAmount: p.totalAmount,
                paidAmount: p.paidAmount,
                balanceAmount: p.balanceAmount,
                status: p.status,
                customer: p.customer?.name
            });
        });
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

check();
