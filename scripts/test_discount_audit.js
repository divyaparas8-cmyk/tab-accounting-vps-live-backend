function testBuildRatePortions({ doc, items, allocatedAmount, exRate = 1.0, baseTxData = {} }) {
    const alloc = parseFloat(allocatedAmount) || 0;
    if (alloc <= 0) return [];

    const totalDocAmount = parseFloat(doc?.totalAmount) || 0;
    const totalDocTax = parseFloat(doc?.taxAmount) || 0;
    const rawSubtotal = parseFloat(doc?.subtotal) || 0;
    const rawDisc = parseFloat(doc?.discountAmount) || 0;
    const netDocSubtotal = Math.max(0, rawSubtotal - rawDisc);

    // Group items by statutory tax rate
    const rateGroups = {};
    let totalItemNet = 0;

    if (items && items.length > 0) {
        for (const it of items) {
            const r = it.taxRate !== undefined && it.taxRate !== null ? parseFloat(it.taxRate) : 0;
            const rKey = r.toFixed(1);

            const itemNet = parseFloat(it.amount) !== undefined && !isNaN(parseFloat(it.amount))
                ? parseFloat(it.amount)
                : (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0) * (1 - (parseFloat(it.discount) || 0) / 100);

            const taxFieldsSum = (parseFloat(it.cgstAmount) || 0) + (parseFloat(it.sgstAmount) || 0) + (parseFloat(it.igstAmount) || 0);
            const itemTax = taxFieldsSum > 0 ? taxFieldsSum : (r > 0 ? (itemNet * (r / 100)) : 0);

            if (!rateGroups[rKey]) {
                rateGroups[rKey] = {
                    rate: r,
                    net: 0,
                    tax: 0,
                    gross: 0
                };
            }
            rateGroups[rKey].net += itemNet;
            rateGroups[rKey].tax += itemTax;
            rateGroups[rKey].gross += (itemNet + itemTax);
            totalItemNet += itemNet;
        }
    }

    // If invoice-level discount exists and line items weren't individually discounted,
    // scale rate group net and tax proportionally so discount applies across all rate groups.
    if (totalItemNet > 0 && netDocSubtotal > 0 && Math.abs(totalItemNet - netDocSubtotal) > 0.01) {
        const scale = netDocSubtotal / totalItemNet;
        for (const key of Object.keys(rateGroups)) {
            rateGroups[key].net = rateGroups[key].net * scale;
            if (rateGroups[key].rate > 0) {
                rateGroups[key].tax = rateGroups[key].net * (rateGroups[key].rate / 100);
            } else {
                rateGroups[key].tax = 0;
            }
            rateGroups[key].gross = rateGroups[key].net + rateGroups[key].tax;
        }
    }

    const groups = Object.values(rateGroups).sort((a, b) => b.rate - a.rate);
    const grossAllocated = Number((alloc * exRate).toFixed(2));
    const payRatio = totalDocAmount > 0 ? Math.min(1.0, alloc / totalDocAmount) : 1.0;

    if (groups.length === 0) {
        // Fallback when no items are available
        const taxAlloc = Number((totalDocTax * payRatio * exRate).toFixed(2));
        const netAlloc = Number((grossAllocated - taxAlloc).toFixed(2));
        const rate = netAlloc > 0 && taxAlloc > 0 ? Number(((taxAlloc / netAlloc) * 100).toFixed(1)) : 0;
        return [{
            ...baseTxData,
            id: baseTxData.idPrefix || 'TX-1',
            taxableAmount: netAlloc,
            vatRate: rate,
            vatAmount: taxAlloc,
            grossAmount: grossAllocated
        }];
    }

    // Allocate across rate groups
    const portions = [];
    let allocatedGrossSum = 0;
    let allocatedTaxSum = 0;

    // Separate taxed groups vs 0% (zero/exempt) groups
    const taxedGroups = groups.filter(g => g.rate > 0);
    const zeroGroups = groups.filter(g => g.rate <= 0);

    // Process taxed groups first
    taxedGroups.forEach((g) => {
        const pTax = Number((g.tax * payRatio * exRate).toFixed(2));
        let pNet = Number((g.net * payRatio * exRate).toFixed(2));

        // Align net with ideal rounded tax rate division if within 2 cents
        if (g.rate > 0) {
            const idealNet = Number((pTax / (g.rate / 100)).toFixed(2));
            if (Math.abs(idealNet - pNet) <= 0.02) {
                pNet = idealNet;
            }
        }

        const pGross = Number((pNet + pTax).toFixed(2));

        allocatedGrossSum += pGross;
        allocatedTaxSum += pTax;

        portions.push({
            ...baseTxData,
            id: groups.length > 1 ? `${baseTxData.idPrefix || 'TX'}-R${g.rate}` : (baseTxData.idPrefix || 'TX'),
            taxableAmount: pNet,
            vatRate: g.rate,
            vatAmount: pTax,
            grossAmount: pGross
        });
    });

    // Process zero-rated groups
    if (zeroGroups.length > 0) {
        const sumZeroNet = zeroGroups.reduce((s, g) => s + g.net, 0);
        const remainingGross = Number((grossAllocated - allocatedGrossSum).toFixed(2));

        let currentZeroGrossSum = 0;
        zeroGroups.forEach((g, idx) => {
            const isLast = idx === zeroGroups.length - 1;
            const share = sumZeroNet > 0 ? (g.net / sumZeroNet) : (1 / zeroGroups.length);
            const pGross = isLast
                ? Number((remainingGross - currentZeroGrossSum).toFixed(2))
                : Number((remainingGross * share).toFixed(2));
            currentZeroGrossSum += pGross;

            portions.push({
                ...baseTxData,
                id: groups.length > 1 ? `${baseTxData.idPrefix || 'TX'}-R${g.rate}` : (baseTxData.idPrefix || 'TX'),
                taxableAmount: pGross,
                vatRate: 0,
                vatAmount: 0,
                grossAmount: pGross
            });
        });
    } else if (portions.length > 0 && Math.abs(grossAllocated - allocatedGrossSum) > 0.001) {
        // No zero rate groups, adjust pennies on the last taxed group
        const diff = Number((grossAllocated - allocatedGrossSum).toFixed(2));
        const lastPortion = portions[portions.length - 1];
        lastPortion.grossAmount = Number((lastPortion.grossAmount + diff).toFixed(2));
        lastPortion.taxableAmount = Number((lastPortion.grossAmount - lastPortion.vatAmount).toFixed(2));
    }

    return portions;
}

// Test Case 1: Invoice-level discount (10% discount on €1,000 @ 23% and €1,000 @ 0%)
console.log('--- TEST: Invoice-level discount with 23% and 0% items ---');
const docDisc = {
    subtotal: 2000,
    discountAmount: 200,
    taxAmount: 207,
    totalAmount: 2007
};
const itemsDisc = [
    { amount: 1000, taxRate: 23 },
    { amount: 1000, taxRate: 0 }
];
const resDisc = testBuildRatePortions({
    doc: docDisc,
    items: itemsDisc,
    allocatedAmount: 2007,
    exRate: 1.0,
    baseTxData: { idPrefix: 'INV-DISC' }
});
console.log('Full payment (€2,007):', JSON.stringify(resDisc, null, 2));

const p23 = resDisc.find(p => p.vatRate === 23);
const p0 = resDisc.find(p => p.vatRate === 0);
console.log(`23% Portion: Net €${p23.taxableAmount}, VAT €${p23.vatAmount}, Gross €${p23.grossAmount} (Rate: ${(p23.vatAmount/p23.taxableAmount*100).toFixed(1)}%)`);
console.log(`0% Portion: Net €${p0.taxableAmount}, VAT €${p0.vatAmount}, Gross €${p0.grossAmount}`);
console.log(`Total: Net €${p23.taxableAmount + p0.taxableAmount} + VAT €${p23.vatAmount + p0.vatAmount} = €${p23.grossAmount + p0.grossAmount}`);

// Partial payment of €1,000 on this invoice:
const resPart = testBuildRatePortions({
    doc: docDisc,
    items: itemsDisc,
    allocatedAmount: 1000,
    exRate: 1.0,
    baseTxData: { idPrefix: 'INV-DISC-PART' }
});
console.log('\nPartial payment (€1,000):', JSON.stringify(resPart, null, 2));
const partNet = resPart.reduce((s, p) => s + p.taxableAmount, 0);
const partVat = resPart.reduce((s, p) => s + p.vatAmount, 0);
const partGross = resPart.reduce((s, p) => s + p.grossAmount, 0);
console.log(`Partial Total: Net €${partNet.toFixed(2)} + VAT €${partVat.toFixed(2)} = €${partGross.toFixed(2)}`);

// Also verify INV-1001 (€3,000 payment)
console.log('\n--- VERIFY INV-1001 (€3,000 payment) ---');
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
    { amount: 3150, taxRate: 23 }
];
const res1001 = testBuildRatePortions({
    doc: inv1001Doc,
    items: inv1001Items,
    allocatedAmount: 3000,
    exRate: 1.0,
    baseTxData: { idPrefix: 'PAY-1003' }
});
console.log('INV-1001 Result:', JSON.stringify(res1001, null, 2));
