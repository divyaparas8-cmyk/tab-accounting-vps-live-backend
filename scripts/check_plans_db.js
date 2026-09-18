const prisma = require('../src/config/prisma');

async function checkPlans() {
    const plans = await prisma.plan.findMany();
    console.log('Total plans in DB:', plans.length);
    const { getPlans } = require('../src/controllers/planController');
    let allPlansResult = null;
    await getPlans({}, {
        json: (d) => { allPlansResult = d; },
        status: (code) => ({ json: (e) => console.log('getPlans error:', code, e) })
    });
    console.log('planController.getPlans returned:', allPlansResult ? allPlansResult.length : 'error');
    if (allPlansResult) {
        for (const p of allPlansResult) {
            console.log(`- ID: ${p.id} | Name: "${p.name}" | Status: "${p.status}"`);
        }
    }

    const companies = await prisma.company.findMany({
        select: { id: true, name: true, email: true, planId: true, planName: true }
    });
    console.log('\nAll Companies in DB:');
    for (const c of companies) {
        console.log(`- ID: ${c.id} | Name: "${c.name}" | Email: ${c.email} | PlanId: ${c.planId} | PlanName: "${c.planName}"`);
    }

    await prisma.$disconnect();
}

checkPlans();
