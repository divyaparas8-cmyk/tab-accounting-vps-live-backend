async function test() {
    const res = await fetch('https://api.tabaccounts.com/api/public/invoice/INV-1001');
    const d = await res.json();
    const inv = d.data;

    function buildRatePortions({ doc, items, allocatedAmount, exRate = 1.0, baseTxData = {} }) {
        const alloc = parseFloat(allocatedAmount) || 0;
        if (alloc <= 0) return [];

        const totalDocAmount = parseFloat(doc?.totalAmount) || 0;
        const totalDocTax = parseFloat(doc?.taxAmount) || 0;

        // Group items by statutory tax rate
        const rateGroups = {};
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

    console.log('--- TEST 1: Payment Receipt-1003 (3,000.00 EUR) ---');
    const portions1003 = buildRatePortions({
        doc: inv,
        items: inv.invoiceitem,
        allocatedAmount: 3000,
        exRate: 1.0,
        baseTxData: { idPrefix: 'REC-73-ALLOC-96', docNumber: 'Payment Receipt-1003', refNumber: 'INV-1001' }
    });
    console.log(JSON.stringify(portions1003, null, 2));

    const totalNet = portions1003.reduce((s, p) => s + p.taxableAmount, 0);
    const totalTax = portions1003.reduce((s, p) => s + p.vatAmount, 0);
    const totalGross = portions1003.reduce((s, p) => s + p.grossAmount, 0);
    console.log('Reconciliation: Net:', totalNet, 'Tax:', totalTax, 'Net+Tax:', Number((totalNet + totalTax).toFixed(2)), 'Gross:', totalGross);

    console.log('\n--- TEST 2: Payment Receipt-1001 (1,300.00 EUR) ---');
    const portions1001 = buildRatePortions({
        doc: inv,
        items: inv.invoiceitem,
        allocatedAmount: 1300,
        exRate: 1.0,
        baseTxData: { idPrefix: 'REC-71-ALLOC-93', docNumber: 'Payment Receipt-1001', refNumber: 'INV-1001' }
    });
    console.log(JSON.stringify(portions1001, null, 2));
    const totalNet2 = portions1001.reduce((s, p) => s + p.taxableAmount, 0);
    const totalTax2 = portions1001.reduce((s, p) => s + p.vatAmount, 0);
    const totalGross2 = portions1001.reduce((s, p) => s + p.grossAmount, 0);
    console.log('Reconciliation: Net:', totalNet2, 'Tax:', totalTax2, 'Net+Tax:', Number((totalNet2 + totalTax2).toFixed(2)), 'Gross:', totalGross2);

    console.log('\n--- TEST 3: Full Payment (6,574.50 EUR) ---');
    const portionsFull = buildRatePortions({
        doc: inv,
        items: inv.invoiceitem,
        allocatedAmount: 6574.50,
        exRate: 1.0,
        baseTxData: { idPrefix: 'REC-FULL', docNumber: 'Payment Receipt-FULL', refNumber: 'INV-1001' }
    });
    console.log(JSON.stringify(portionsFull, null, 2));
    const totalNet3 = portionsFull.reduce((s, p) => s + p.taxableAmount, 0);
    const totalTax3 = portionsFull.reduce((s, p) => s + p.vatAmount, 0);
    const totalGross3 = portionsFull.reduce((s, p) => s + p.grossAmount, 0);
    console.log('Reconciliation: Net:', totalNet3, 'Tax:', totalTax3, 'Net+Tax:', Number((totalNet3 + totalTax3).toFixed(2)), 'Gross:', totalGross3);
}
test();
