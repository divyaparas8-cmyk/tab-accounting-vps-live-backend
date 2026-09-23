const prisma = require('../src/config/prisma');

async function testAgentReport() {
    // Get sales invoices for company 3
    const invoices = await prisma.invoice.findMany({
        where: { companyId: 3 },
        include: { customer: true, invoiceitem: true }
    });
    const bills = await prisma.purchasebill.findMany({
        where: { companyId: 3 },
        include: { vendor: true, purchasebillitem: true }
    });

    console.log(`Invoices count: ${invoices.length}`);
    console.log(`Purchase bills count: ${bills.length}`);

    // Map according to AgentReport.jsx
    const mapInvoiceToDoc = (inv) => {
        const isRet = Boolean(inv.isReturn);
        const isPosRet = Boolean(inv.isPosReturn || inv.type === 'POS_RETURN');
        const docType = isPosRet ? 'POS Return' : (isRet ? 'Sales Return' : (inv.source === 'POS' || inv.type === 'POS_SALE' ? 'POS Sale' : 'Sale'));
        return {
            docNumber: inv.invoiceNumber,
            type: docType,
            totalAmount: inv.totalAmount || 0,
            paidAmount: inv.paidAmount || 0,
            balanceAmount: inv.balanceAmount || 0,
            isReturn: isRet
        };
    };

    const mapBillToDoc = (bill) => {
        const isRet = Boolean(bill.isReturn);
        const docType = isRet ? 'Purchase Return' : 'Purchase';
        return {
            docNumber: bill.billNumber,
            type: docType,
            totalAmount: bill.totalAmount || 0,
            paidAmount: (bill.totalAmount || 0) - (bill.balanceAmount || 0),
            balanceAmount: bill.balanceAmount || 0,
            isReturn: isRet
        };
    };

    const docs = [...invoices.map(mapInvoiceToDoc), ...bills.map(mapBillToDoc)];

    // Current AgentReport.jsx logic:
    let currentTotalSales = 0;
    let currentTotalPurchases = 0;
    let currentPaid = 0;
    let currentUnpaid = 0;

    docs.forEach(d => {
        if (d.type === 'Sale') {
            currentTotalSales += d.totalAmount;
        } else {
            currentTotalPurchases += d.totalAmount;
        }
        currentPaid += d.paidAmount;
        currentUnpaid += d.balanceAmount;
    });

    console.log("=== CURRENT AGENT REPORT TOTALS ===");
    console.log(`Total Sales Volume:    €${currentTotalSales.toFixed(2)}`);
    console.log(`Total Purchase Volume: €${currentTotalPurchases.toFixed(2)}`);
    console.log(`Collected Amount:      €${currentPaid.toFixed(2)}`);
    console.log(`Outstanding Balance:   €${currentUnpaid.toFixed(2)}`);

    // Now what SHOULD it be?
    // In an Agent Report:
    // Sales should include 'Sale' AND 'POS Sale', minus 'Sales Return' and 'POS Return'!
    // Purchases should include 'Purchase' minus 'Purchase Return'!
    let correctSales = 0;
    let correctPurchases = 0;
    docs.forEach(d => {
        if (['Sale', 'POS Sale'].includes(d.type)) {
            correctSales += d.totalAmount;
        } else if (['Sales Return', 'POS Return'].includes(d.type)) {
            correctSales -= Math.abs(d.totalAmount);
        } else if (d.type === 'Purchase') {
            correctPurchases += d.totalAmount;
        } else if (d.type === 'Purchase Return') {
            correctPurchases -= Math.abs(d.totalAmount);
        }
    });

    console.log("\n=== CORRECT ACCOUNTING TOTALS ===");
    console.log(`Real Total Sales Volume:    €${correctSales.toFixed(2)}`);
    console.log(`Real Total Purchase Volume: €${correctPurchases.toFixed(2)}`);
    
    // Check which docs were misclassified into purchases
    console.log("\nDocs classified into Total Purchase Volume currently:");
    docs.forEach(d => {
        if (d.type !== 'Sale') {
            console.log(`  - [${d.type}] ${d.docNumber}: €${d.totalAmount}`);
        }
    });
}

testAgentReport().finally(() => process.exit(0));
