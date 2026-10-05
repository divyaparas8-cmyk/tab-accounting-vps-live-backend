const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { getVatReport } = require('../src/controllers/reportController.js');

async function auditPeriod5() {
    console.log('Auditing CEAC Ltd (Company ID 3) for Period 5 (Sep - Oct) 2026...');

    // Mock Express req and res
    function mockReqRes(basis) {
        const req = {
            query: {
                companyId: 3,
                year: 2026,
                period: 'P5',
                basis
            }
        };
        let responseData = null;
        const res = {
            status: (code) => {
                return {
                    json: (data) => {
                        responseData = { code, data };
                        return responseData;
                    }
                };
            },
            json: (data) => {
                responseData = { code: 200, data };
                return responseData;
            }
        };
        return { req, res, getData: () => responseData };
    }

    // 1. CASH BASIS
    console.log('\n=================== 1. CASH BASIS ===================');
    const cashCtx = mockReqRes('cash');
    await getVatReport(cashCtx.req, cashCtx.res);
    const cashData = cashCtx.getData()?.data?.detailed;

    console.log('Summary:', cashData.summary);
    console.log('\nRate Breakdown (Cash):');
    console.table(cashData.rateBreakdown.map(r => ({
        Rate: r.rateLabel,
        'Net Sales': r.salesTaxable,
        'Output VAT': r.salesVat,
        'Net Purchases': r.purchasesTaxable,
        'Input VAT': r.purchasesVat,
        'Net VAT': r.netVat
    })));

    // Verify Invariant: Net + VAT = Gross on all output transactions
    let cashGrossSum = 0;
    let cashNetSum = 0;
    let cashVatSum = 0;
    let cashFailed = 0;
    for (const t of cashData.outputVatTransactions) {
        const rowCalc = Number((t.taxableAmount + t.vatAmount).toFixed(2));
        if (Math.abs(rowCalc - t.grossAmount) > 0.02) {
            console.error(`Mismatch on ${t.docNumber} (${t.id}): Net ${t.taxableAmount} + VAT ${t.vatAmount} = ${rowCalc} != Gross ${t.grossAmount}`);
            cashFailed++;
        }
        cashNetSum += t.taxableAmount;
        cashVatSum += t.vatAmount;
        cashGrossSum += t.grossAmount;
    }
    console.log(`Cash Output Transactions Check: ${cashData.outputVatTransactions.length} entries. Failed: ${cashFailed}`);
    console.log(`Cash Output Sums: Net ${cashNetSum.toFixed(2)} + VAT ${cashVatSum.toFixed(2)} = ${cashGrossSum.toFixed(2)}`);

    // 2. ACCRUAL BASIS
    console.log('\n=================== 2. ACCRUAL BASIS ===================');
    const accrualCtx = mockReqRes('accrual');
    await getVatReport(accrualCtx.req, accrualCtx.res);
    const accrualData = accrualCtx.getData()?.data?.detailed;

    console.log('Summary:', accrualData.summary);
    console.log('\nRate Breakdown (Accrual):');
    console.table(accrualData.rateBreakdown.map(r => ({
        Rate: r.rateLabel,
        'Net Sales': r.salesTaxable,
        'Output VAT': r.salesVat,
        'Net Purchases': r.purchasesTaxable,
        'Input VAT': r.purchasesVat,
        'Net VAT': r.netVat
    })));

    let accGrossSum = 0;
    let accNetSum = 0;
    let accVatSum = 0;
    let accFailed = 0;
    for (const t of accrualData.outputVatTransactions) {
        const rowCalc = Number((t.taxableAmount + t.vatAmount).toFixed(2));
        if (Math.abs(rowCalc - t.grossAmount) > 0.02) {
            console.error(`Mismatch on ${t.docNumber} (${t.id}): Net ${t.taxableAmount} + VAT ${t.vatAmount} = ${rowCalc} != Gross ${t.grossAmount}`);
            accFailed++;
        }
        accNetSum += t.taxableAmount;
        accVatSum += t.vatAmount;
        accGrossSum += t.grossAmount;
    }
    console.log(`Accrual Output Transactions Check: ${accrualData.outputVatTransactions.length} entries. Failed: ${accFailed}`);
    console.log(`Accrual Output Sums: Net ${accNetSum.toFixed(2)} + VAT ${accVatSum.toFixed(2)} = ${accGrossSum.toFixed(2)}`);

    console.log('\n========================================================');
    console.log('All checks complete!');
}

auditPeriod5().catch(console.error).finally(() => prisma.$disconnect());
