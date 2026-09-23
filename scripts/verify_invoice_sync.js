const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { computeInvoiceStatusAndBalance, syncInvoiceInDb } = require('../src/utils/invoiceSyncHelper');

async function verify() {
    console.log('=== VERIFYING INVOICE SYNCHRONIZATION ===\n');

    const invoices = await prisma.invoice.findMany({
        include: {
            customer: true,
            allocations: {
                include: {
                    receipt: true
                }
            },
            advanceadjustments: true,
            salesreturn: true
        },
        orderBy: { id: 'asc' }
    });

    console.log(`Found ${invoices.length} invoices in database:`);
    let allPassed = true;

    for (const inv of invoices) {
        console.log(`\n--- Invoice ID: ${inv.id} (${inv.invoiceNumber}) ---`);
        console.log(`Customer: ${inv.customer?.name} (ID: ${inv.customerId})`);
        console.log(`DB Values -> Total: ${inv.totalAmount}, Paid: ${inv.paidAmount}, Bal: ${inv.balanceAmount}, Status: ${inv.status}`);

        // Allocations check
        const allocTotal = (inv.allocations || []).reduce((sum, a) => sum + parseFloat(a.amount || 0), 0);
        console.log(`Allocations count: ${inv.allocations.length}, Sum: ${allocTotal}`);

        // Compute authoritative
        const { netTotal, paidAmount, balanceAmount, status } = computeInvoiceStatusAndBalance(
            inv,
            allocTotal,
            0.01,
            (inv.salesreturn || []).reduce((s, r) => s + parseFloat(r.totalAmount || 0), 0)
        );

        console.log(`Computed -> Total: ${netTotal}, Paid: ${paidAmount}, Bal: ${balanceAmount}, Status: ${status}`);

        const matchTotal = Math.abs(inv.totalAmount - netTotal) < 0.01;
        const matchPaid = Math.abs(inv.paidAmount - paidAmount) < 0.01;
        const matchBal = Math.abs(inv.balanceAmount - balanceAmount) < 0.01;
        const matchStatus = inv.status === status || (inv.status === 'PARTIAL' && (status === 'PARTIALLY PAID' || status === 'PARTIAL'));

        if (!matchTotal || !matchPaid || !matchBal || !matchStatus) {
            console.error(`FAILED match on Invoice #${inv.invoiceNumber}`);
            allPassed = false;
        } else {
            console.log(`PASS: Database values match authoritative calculation.`);
        }
    }

    // Check Combined Invoices for customer 36 (Dhruv)
    const cust36Invoices = invoices.filter(i => i.customerId === 36);
    console.log(`\n=== CUSTOMER 36 (Dhruv) COMBINED INVOICE CHECK ===`);
    console.log(`Constituent invoices: ${cust36Invoices.map(i => i.invoiceNumber).join(', ')}`);

    const combinedTotal = cust36Invoices.reduce((s, i) => s + i.totalAmount, 0);
    const combinedPaid = cust36Invoices.reduce((s, i) => s + i.paidAmount, 0);
    const combinedBal = cust36Invoices.reduce((s, i) => s + i.balanceAmount, 0);

    console.log(`Combined Sum -> Total: ${combinedTotal.toFixed(2)}, Paid: ${combinedPaid.toFixed(2)}, Bal: ${combinedBal.toFixed(2)}`);
    const mathCheck = Math.abs((combinedTotal - combinedPaid) - combinedBal) < 0.01;
    console.log(`Reconciliation check (Total - Paid = Bal): ${mathCheck ? 'PASS' : 'FAIL'}`);

    if (!mathCheck) allPassed = false;

    console.log(`\n=== OVERALL VERIFICATION RESULT: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'} ===`);
}

verify().catch(console.error).finally(() => prisma.$disconnect());
