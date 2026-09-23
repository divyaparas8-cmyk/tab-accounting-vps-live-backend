async function test() {
    const res = await fetch('https://api.tabaccounts.com/api/public/invoice/INV-1788951450266');
    const json = await res.json();
    const inv = json.data;
    console.log({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        companyId: inv.companyId,
        customerId: inv.customerId,
        date: inv.date,
        dueDate: inv.dueDate,
        subtotal: inv.subtotal,
        taxAmount: inv.taxAmount,
        discountAmount: inv.discountAmount,
        overallDiscount: inv.overallDiscount,
        overallDiscountType: inv.overallDiscountType,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        balanceAmount: inv.balanceAmount,
        status: inv.status,
        originalTotalAmount: inv.originalTotalAmount,
        originalSubtotal: inv.originalSubtotal,
        originalTaxAmount: inv.originalTaxAmount,
        invoiceitemCount: inv.invoiceitem?.length,
        items: inv.invoiceitem?.map(i => ({
            description: i.description,
            quantity: i.quantity,
            rate: i.rate,
            discount: i.discount,
            taxRate: i.taxRate,
            amount: i.amount
        })),
        allocationsCount: inv.allocations?.length,
        allocations: inv.allocations?.map(a => ({
            id: a.id,
            amount: a.amount,
            receiptNumber: a.receipt?.receiptNumber,
            date: a.receipt?.date,
            balanceBeforePayment: a.balanceBeforePayment,
            balanceAfterPayment: a.balanceAfterPayment
        }))
    });
}
test();
