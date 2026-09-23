const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'mysql://root@localhost:3306/tab_account' } } });
const bcrypt = require('bcryptjs');

async function testAll() {
    const users = await prisma.user.findMany({
        include: {
            company: {
                include: { plan: true }
            }
        }
    });

    console.log(`=== USERS IN LOCAL DB (${users.length}) ===`);
    for (const u of users) {
        console.log(`\nEmail: ${u.email} | Name: ${u.name} | Role: ${u.role} | loginEnabled: ${u.loginEnabled}`);
        console.log(`Company: ID ${u.companyId} - ${u.company?.name}`);
        
        console.log(`Password Hash: ${u.password}`);
    }
}

testAll().finally(() => prisma.$disconnect());
