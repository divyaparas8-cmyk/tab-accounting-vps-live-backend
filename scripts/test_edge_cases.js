const assert = require('assert');
const fs = require('fs');

// Extract buildRatePortions directly from production reportController.js
const reportControllerCode = fs.readFileSync('src/controllers/reportController.js', 'utf8');
const fnCode = reportControllerCode.substring(
    reportControllerCode.indexOf('const buildRatePortions ='),
    reportControllerCode.indexOf('const getVatReport =')
);
const buildRatePortions = new Function(fnCode + '\nreturn buildRatePortions;')();

console.log('================================================================');
console.log('   VAT REPORT PRODUCTION CALCULATION & INVARIANT AUDIT SUITE    ');
console.log('================================================================\n');

function verifyPortions(portions, expectedGross, testName) {
    console.log(`[TEST] ${testName}`);
    console.log(JSON.stringify(portions, null, 2));

    let sumNet = 0;
    let sumVat = 0;
    let sumGross = 0;

    for (const p of portions) {
        // Invariant: Taxable Net + VAT Amount = Gross Transaction Amount (within 1 cent)
        const rowCalc = Number((p.taxableAmount + p.vatAmount).toFixed(2));
        assert.strictEqual(
            rowCalc,
            p.grossAmount,
            `Row invariant failed: Net (${p.taxableAmount}) + VAT (${p.vatAmount}) = ${rowCalc} != Gross (${p.grossAmount})`
        );

        // Invariant: Statutory VAT Rate preservation
        if (p.vatRate === 0) {
            assert.strictEqual(p.vatAmount, 0, '0% rate portion must have exactly 0 VAT');
        } else {
            // Check that rate matches statutory rate
            const effRate = Number(((p.vatAmount / p.taxableAmount) * 100).toFixed(1));
            assert(
                Math.abs(effRate - p.vatRate) <= 0.2,
                `Portion rate ${p.vatRate}% does not match calculated rate ${effRate}%`
            );
        }

        sumNet = Number((sumNet + p.taxableAmount).toFixed(2));
        sumVat = Number((sumVat + p.vatAmount).toFixed(2));
        sumGross = Number((sumGross + p.grossAmount).toFixed(2));
    }

    const netPlusVat = Number((sumNet + sumVat).toFixed(2));
    assert.strictEqual(
        sumGross,
        expectedGross,
        `Total gross allocated (${sumGross}) does not match expected gross (${expectedGross})`
    );
    assert.strictEqual(
        netPlusVat,
        expectedGross,
        `Total Net + VAT (${netPlusVat}) does not match expected gross (${expectedGross})`
    );

    console.log(`=> PASSED: Net €${sumNet} + VAT €${sumVat} = Gross €${sumGross} (Target €${expectedGross})\n`);
}

// -------------------------------------------------------------------------
// TEST 1: INV-1001 Cash Basis €3,000 Payment
// -------------------------------------------------------------------------
const inv1001Doc = {
    subtotal: 5740,
    discountAmount: 350,
    taxAmount: 1184.50,
    totalAmount: 6574.50
};
const inv1001Items = [
    { amount: 2000, taxRate: 23 },
    { amount: 90, taxRate: 0 },
    { amount: 150, taxRate: 0 },
    { amount: 3150, taxRate: 23 } // 3500 - 350 line discount
];
const res1 = buildRatePortions({
    doc: inv1001Doc,
    items: inv1001Items,
    allocatedAmount: 3000,
    exRate: 1.0,
    baseTxData: { idPrefix: 'PAY-1003', docNumber: 'Receipt-1003', refNumber: 'INV-1001', type: 'Payment Receipt' }
});
verifyPortions(res1, 3000.00, 'INV-1001: €3,000 partial payment on mixed 23% and 0% invoice');
assert.strictEqual(res1.length, 2, 'Must have 2 rate portions');
const p23_1 = res1.find(p => p.vatRate === 23);
const p0_1 = res1.find(p => p.vatRate === 0);
assert.strictEqual(p23_1.taxableAmount, 2350.00);
assert.strictEqual(p23_1.vatAmount, 540.50);
assert.strictEqual(p23_1.grossAmount, 2890.50);
assert.strictEqual(p0_1.taxableAmount, 109.50);
assert.strictEqual(p0_1.vatAmount, 0.00);
assert.strictEqual(p0_1.grossAmount, 109.50);

// -------------------------------------------------------------------------
// TEST 2: Single Rate 23% Full Payment without discount
// -------------------------------------------------------------------------
const single23Doc = { subtotal: 1000, discountAmount: 0, taxAmount: 230, totalAmount: 1230 };
const single23Items = [{ amount: 1000, taxRate: 23 }];
const res2 = buildRatePortions({
    doc: single23Doc,
    items: single23Items,
    allocatedAmount: 1230,
    exRate: 1.0,
    baseTxData: { idPrefix: 'PAY-2001', docNumber: 'Receipt-2001', refNumber: 'INV-2001', type: 'Payment Receipt' }
});
verifyPortions(res2, 1230.00, 'Single 23% invoice: Full payment');

// -------------------------------------------------------------------------
// TEST 3: Single Rate 0% (Exempt) with discount, partial payment
// -------------------------------------------------------------------------
const zeroDoc = { subtotal: 500, discountAmount: 50, taxAmount: 0, totalAmount: 450 };
const zeroItems = [{ amount: 500, taxRate: 0 }];
const res3 = buildRatePortions({
    doc: zeroDoc,
    items: zeroItems,
    allocatedAmount: 200,
    exRate: 1.0,
    baseTxData: { idPrefix: 'PAY-3001', docNumber: 'Receipt-3001', refNumber: 'INV-3001', type: 'Payment Receipt' }
});
verifyPortions(res3, 200.00, '0% / Exempt invoice with discount: Partial payment');
assert.strictEqual(res3[0].vatRate, 0);
assert.strictEqual(res3[0].vatAmount, 0);
assert.strictEqual(res3[0].taxableAmount, 200.00);

// -------------------------------------------------------------------------
// TEST 4: Multiple Non-Zero Rates (23%, 13.5%, 0%)
// -------------------------------------------------------------------------
const multiDoc = {
    subtotal: 1700,
    discountAmount: 0,
    taxAmount: 297.50, // 230 + 67.50
    totalAmount: 1997.50
};
const multiItems = [
    { amount: 1000, taxRate: 23 },
    { amount: 500, taxRate: 13.5 },
    { amount: 200, taxRate: 0 }
];
const res4 = buildRatePortions({
    doc: multiDoc,
    items: multiItems,
    allocatedAmount: 1000,
    exRate: 1.0,
    baseTxData: { idPrefix: 'PAY-4001', docNumber: 'Receipt-4001', refNumber: 'INV-4001', type: 'Payment Receipt' }
});
verifyPortions(res4, 1000.00, 'Multi-rate (23%, 13.5%, 0%): Partial payment');

// -------------------------------------------------------------------------
// TEST 5: IMPORTANT DISCOUNT TEST - Invoice-Level Discount on 23% and 0% items
// -------------------------------------------------------------------------
const discDoc = {
    subtotal: 2000,
    discountAmount: 200, // 10% discount affecting both items
    taxAmount: 207,      // 23% on discounted €900 = €207
    totalAmount: 2007    // €1800 net + €207 tax
};
const discItems = [
    { amount: 1000, taxRate: 23 },
    { amount: 1000, taxRate: 0 }
];
// Full payment on invoice-level discount
const res5Full = buildRatePortions({
    doc: discDoc,
    items: discItems,
    allocatedAmount: 2007,
    exRate: 1.0,
    baseTxData: { idPrefix: 'PAY-5001', docNumber: 'Receipt-5001', refNumber: 'INV-5001', type: 'Payment Receipt' }
});
verifyPortions(res5Full, 2007.00, 'Invoice-level discount on 23% + 0% items: Full payment');
const p23_5 = res5Full.find(p => p.vatRate === 23);
const p0_5 = res5Full.find(p => p.vatRate === 0);
assert.strictEqual(p23_5.taxableAmount, 900.00, '23% portion net must be discounted to 900');
assert.strictEqual(p23_5.vatAmount, 207.00, '23% portion tax must be 207');
assert.strictEqual(p23_5.vatRate, 23, 'Statutory rate must remain 23%');
assert.strictEqual(p0_5.taxableAmount, 900.00, '0% portion net must be discounted to 900');
assert.strictEqual(p0_5.vatAmount, 0.00, '0% portion tax must be 0');
assert.strictEqual(p0_5.vatRate, 0, 'Statutory rate must remain 0%');

// Partial payment of €1,000 on this invoice
const res5Part = buildRatePortions({
    doc: discDoc,
    items: discItems,
    allocatedAmount: 1000,
    exRate: 1.0,
    baseTxData: { idPrefix: 'PAY-5002', docNumber: 'Receipt-5002', refNumber: 'INV-5001', type: 'Payment Receipt' }
});
verifyPortions(res5Part, 1000.00, 'Invoice-level discount on 23% + 0% items: Partial payment €1,000');

// -------------------------------------------------------------------------
// TEST 6: Multiple Payments Reconciling to 100% of Invoice
// -------------------------------------------------------------------------
const p1 = buildRatePortions({ doc: inv1001Doc, items: inv1001Items, allocatedAmount: 1300, exRate: 1.0, baseTxData: { idPrefix: 'P1' } });
const p2 = buildRatePortions({ doc: inv1001Doc, items: inv1001Items, allocatedAmount: 3000, exRate: 1.0, baseTxData: { idPrefix: 'P2' } });
const p3 = buildRatePortions({ doc: inv1001Doc, items: inv1001Items, allocatedAmount: 2274.50, exRate: 1.0, baseTxData: { idPrefix: 'P3' } });
verifyPortions(p1, 1300.00, 'Payment 1 of 3 (€1,300)');
verifyPortions(p2, 3000.00, 'Payment 2 of 3 (€3,000)');
verifyPortions(p3, 2274.50, 'Payment 3 of 3 (€2,274.50)');
const totalAllocated = Number((1300 + 3000 + 2274.50).toFixed(2));
assert.strictEqual(totalAllocated, 6574.50, 'Sum of payments must equal invoice total');

const sumNetAll = Number((
    p1.reduce((s, p) => s + p.taxableAmount, 0) +
    p2.reduce((s, p) => s + p.taxableAmount, 0) +
    p3.reduce((s, p) => s + p.taxableAmount, 0)
).toFixed(2));
const sumVatAll = Number((
    p1.reduce((s, p) => s + p.vatAmount, 0) +
    p2.reduce((s, p) => s + p.vatAmount, 0) +
    p3.reduce((s, p) => s + p.vatAmount, 0)
).toFixed(2));
assert(
    Math.abs(sumNetAll - 5390.00) <= 0.02,
    `Total net across all 3 payments (${sumNetAll}) must reconcile to discounted subtotal €5,390 within 2 cents`
);
assert(
    Math.abs(sumVatAll - 1184.50) <= 0.02,
    `Total VAT across all 3 payments (${sumVatAll}) must reconcile to invoice VAT €1,184.50 within 2 cents`
);
assert.strictEqual(
    Number((sumNetAll + sumVatAll).toFixed(2)),
    6574.50,
    'Combined Net + VAT across all payments must equal total invoice gross 6574.50'
);

// -------------------------------------------------------------------------
// TEST 7: Foreign Currency Exchange Rate (exRate = 0.92 EUR per USD)
// -------------------------------------------------------------------------
const foreignDoc = { subtotal: 1000, discountAmount: 0, taxAmount: 230, totalAmount: 1230 };
const foreignItems = [{ amount: 1000, taxRate: 23 }];
const resForeign = buildRatePortions({
    doc: foreignDoc,
    items: foreignItems,
    allocatedAmount: 1230,
    exRate: 0.92,
    baseTxData: { idPrefix: 'PAY-USD' }
});
const expectedForeignGross = Number((1230 * 0.92).toFixed(2)); // 1131.60
verifyPortions(resForeign, expectedForeignGross, 'Foreign currency invoice with exchange rate 0.92');

console.log('================================================================');
console.log('       ALL 7 REGRESSION & AUDIT TEST SCENARIOS PASSED!          ');
console.log('================================================================');
