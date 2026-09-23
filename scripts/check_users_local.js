const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'mysql://root@localhost:3306/tab_account' } } });

async function main() {
    console.log('Connecting to local MySQL tab_account...');
    const users = await prisma.user.findMany({
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            loginEnabled: true,
            companyId: true,
            company: { select: { id: true, name: true } }
        }
    });
    console.log(`Found ${users.length} users:`);
    users.forEach(u => {
        console.log(`ID: ${u.id} | Email: ${u.email} | Name: ${u.name} | Role: ${u.role} | Status: ${u.status} | Company: [${u.companyId}] ${u.company?.name}`);
    });

    const companies = await prisma.company.findMany({
        select: { id: true, name: true, email: true }
    });
    console.log(`\nFound ${companies.length} companies:`);
    companies.forEach(c => {
        console.log(`ID: ${c.id} | Name: ${c.name} | Email: ${c.email}`);
    });
}

main()
    .catch(err => console.error('DB Query Error:', err.message))
    .finally(() => prisma.$disconnect());
