const http = require('http');

function postJson(url, data) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const postData = JSON.stringify(data);
        const req = http.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, body });
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

function getJson(url, token) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = http.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname + u.search,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, body });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function verify() {
    console.log('1. Logging in as company@gmail.com with password: 123 ...');
    const loginRes = await postJson('http://localhost:8080/api/auth/login', {
        email: 'company@gmail.com',
        password: '123'
    });

    if (loginRes.status !== 200 || !loginRes.data?.token) {
        console.error('Login failed:', loginRes);
        return;
    }

    console.log('✅ Login successful! User:', loginRes.data.user?.name, '| Company:', loginRes.data.company?.name);
    const token = loginRes.data.token;
    const companyId = loginRes.data.company?.id;

    console.log('\n2. Fetching /api/reports/sales ...');
    const salesRes = await getJson(`http://localhost:8080/api/reports/sales?companyId=${companyId}`, token);

    if (salesRes.status !== 200) {
        console.error('Sales report failed:', salesRes);
        return;
    }

    console.log('✅ Sales report fetched successfully!');
    console.log('Summary:', salesRes.data.summary);
    console.log('Invoices count in data:', salesRes.data.data?.length);

    // Check INV-1788951450280
    const inv280 = salesRes.data.data?.find(i => i.invoiceNumber === 'INV-1788951450280');
    if (inv280) {
        console.log('\nInvoice INV-1788951450280:');
        console.log(`- Number: ${inv280.invoiceNumber}`);
        console.log(`- Customer: ${inv280.customer?.name}`);
        console.log(`- Total Amount: ${inv280.totalAmount}`);
        console.log(`- Paid Amount: ${inv280.paidAmount}`);
        console.log(`- Balance Amount: ${inv280.balanceAmount}`);
        console.log(`- Status: ${inv280.status}`);
        console.log(`- Items count: ${inv280.invoiceitem?.length}`);
        inv280.invoiceitem?.forEach(it => {
            console.log(`   * ${it.product?.name || it.description}: amount=${it.amount}, qty=${it.quantity}`);
        });
    }

    // Check overdue invoices
    console.log('\nOverdue invoices list count:', salesRes.data.overdueInvoices?.length);
    if (salesRes.data.overdueInvoices?.length > 0) {
        console.log('Top overdue invoice:', salesRes.data.overdueInvoices[0].invoiceNumber, 'Balance:', salesRes.data.overdueInvoices[0].balanceAmount);
    }
}

verify().catch(console.error);
