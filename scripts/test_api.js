async function testApi() {
    try {
        const res = await fetch('https://api.tabaccounts.com/api/public/invoice/INV-1788951450266');
        console.log('Public invoice status:', res.status);
        const data = await res.json();
        console.log('Data:', JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('Error:', e.message);
    }
}

testApi();
