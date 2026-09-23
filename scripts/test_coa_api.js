const http = require('http');

async function testApi() {
    // 1. Login
    const postData = JSON.stringify({ email: 'company@gmail.com', password: '123' });
    const req = http.request({
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
        res.on('end', () => {
            const data = JSON.parse(body);
            const token = data.token;
            console.log("Logged in successfully. Token received.");

            // 2. Fetch Chart of Accounts
            http.get({
                hostname: 'localhost',
                port: 8080,
                path: '/api/chart-of-accounts?companyId=3',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            }, (coaRes) => {
                let coaBody = '';
                coaRes.on('data', chunk => coaBody += chunk);
                coaRes.on('end', () => {
                    const coaData = JSON.parse(coaBody);
                    console.log("COA API Status:", coaRes.statusCode);
                    console.log("Groups returned:", coaData.data.length);
                    coaData.data.forEach(g => {
                        console.log(`\nGroup: ${g.name} (${g.type})`);
                        (g.ledger || []).forEach(l => console.log(`  - [${l.id}] ${l.name}: €${l.currentBalance}`));
                        (g.accountsubgroup || []).forEach(s => {
                            console.log(`  Subgroup: ${s.name}`);
                            (s.ledger || []).forEach(l => console.log(`    - [${l.id}] ${l.name}: €${l.currentBalance}`));
                        });
                    });
                });
            });
        });
    });

    req.write(postData);
    req.end();
}

testApi();
