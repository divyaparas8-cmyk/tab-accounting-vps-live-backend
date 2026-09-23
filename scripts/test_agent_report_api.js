const http = require('http');

async function testAgentReportBackend() {
    // 1. Login to get token
    const postData = JSON.stringify({ email: 'company@gmail.com', password: '123' });
    const loginReq = http.request({
        hostname: 'localhost',
        port: 8080,
        path: '/api/auth/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', async () => {
            const token = JSON.parse(body).token;
            
            // 2. Fetch /api/reports/sales and /api/reports/purchase
            const getEndpoint = (path) => new Promise((resolve) => {
                http.get({
                    hostname: 'localhost',
                    port: 8080,
                    path: path,
                    headers: { 'Authorization': `Bearer ${token}` }
                }, (r) => {
                    let b = '';
                    r.on('data', c => b += c);
                    r.on('end', () => resolve(JSON.parse(b)));
                });
            });

            const salesRes = await getEndpoint('/api/reports/sales?companyId=3');
            const purchaseRes = await getEndpoint('/api/reports/purchase?companyId=3');

            const rawInvoices = salesRes.data || [];
            const rawPurchaseBills = purchaseRes.data || [];

            console.log(`Raw Invoices fetched: ${rawInvoices.length}`);
            console.log(`Raw Purchase Bills fetched: ${rawPurchaseBills.length}`);

            // Logic from AgentReport.jsx
            const getDeliveryPersonName = (customFieldsStr) => {
                if (!customFieldsStr) return '';
                try {
                    const parsed = typeof customFieldsStr === 'string' ? JSON.parse(customFieldsStr) : customFieldsStr;
                    return parsed.deliveryPersonName || '';
                } catch (e) {
                    return '';
                }
            };

            const mapInvoiceToDoc = (inv, agentDisplay) => {
                const isRet = Boolean(inv.isReturn);
                const isPosRet = Boolean(inv.isPosReturn || inv.type === 'POS_RETURN');
                const docType = isPosRet ? 'POS Return' : (isRet ? 'Sales Return' : (inv.source === 'POS' || inv.type === 'POS_SALE' ? 'POS Sale' : 'Sale'));
                const docStatus = isRet ? 'Returned' : (inv.status || 'Unpaid');

                return {
                    docNumber: inv.invoiceNumber,
                    type: docType,
                    agentName: agentDisplay,
                    partnerName: inv.customer?.name || 'Walk-in',
                    totalAmount: inv.totalAmount || 0,
                    paidAmount: inv.paidAmount || 0,
                    balanceAmount: inv.balanceAmount || 0,
                    status: docStatus
                };
            };

            const mapBillToDoc = (bill, agentDisplay) => {
                const isRet = Boolean(bill.isReturn);
                const docType = isRet ? 'Purchase Return' : 'Purchase';
                const docStatus = isRet ? 'Returned' : (bill.balanceAmount === 0 ? 'Paid' : (bill.balanceAmount === bill.totalAmount ? 'Unpaid' : 'Partial'));

                return {
                    docNumber: bill.billNumber,
                    type: docType,
                    agentName: agentDisplay,
                    partnerName: bill.vendor?.name || 'Unknown Vendor',
                    totalAmount: bill.totalAmount || 0,
                    paidAmount: (bill.totalAmount || 0) - (bill.balanceAmount || 0),
                    balanceAmount: bill.balanceAmount || 0,
                    status: docStatus
                };
            };

            const invoiceDocs = rawInvoices.map(inv => {
                const dpName = getDeliveryPersonName(inv.customFields);
                const spName = inv.salesperson?.name;
                let agentDisplay = 'Direct / No Agent';
                if (spName && dpName) agentDisplay = `${spName} / ${dpName}`;
                else if (spName) agentDisplay = spName;
                else if (dpName) agentDisplay = dpName;
                return mapInvoiceToDoc(inv, agentDisplay);
            });

            const billDocs = rawPurchaseBills.map(bill => {
                const dpName = getDeliveryPersonName(bill.customFields);
                const spName = bill.salesperson?.name;
                let agentDisplay = 'Direct / No Agent';
                if (spName && dpName) agentDisplay = `${spName} / ${dpName}`;
                else if (spName) agentDisplay = spName;
                else if (dpName) agentDisplay = dpName;
                return mapBillToDoc(bill, agentDisplay);
            });

            const allDocs = [...invoiceDocs, ...billDocs];

            let totalSales = 0;
            let totalPurchases = 0;
            let totalPaid = 0;
            let totalUnpaid = 0;

            allDocs.forEach(d => {
                if (d.type === 'Sale') {
                    totalSales += d.totalAmount;
                } else {
                    totalPurchases += d.totalAmount;
                }
                totalPaid += d.paidAmount;
                totalUnpaid += d.balanceAmount;
            });

            console.log("\n=== AGENT REPORT STATS AS CALCULATED IN FRONTEND ===");
            console.log(`TOTAL SALES VOLUME:    €${totalSales.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
            console.log(`TOTAL PURCHASE VOLUME: €${totalPurchases.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
            console.log(`COLLECTED AMOUNT:      €${totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
            console.log(`OUTSTANDING BALANCE:   €${totalUnpaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);

            console.log("\nBreakdown of Docs by Type:");
            const byType = {};
            allDocs.forEach(d => {
                byType[d.type] = (byType[d.type] || 0) + 1;
            });
            console.log(byType);

            console.log("\nWhat is falling into 'Total Purchases' (because d.type !== 'Sale'):");
            allDocs.filter(d => d.type !== 'Sale').forEach(d => {
                console.log(`  - Type: [${d.type}] | Doc: ${d.docNumber} | Total: €${d.totalAmount}`);
            });
        });
    });

    loginReq.write(postData);
    loginReq.end();
}

testAgentReportBackend();
