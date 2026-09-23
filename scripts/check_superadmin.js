const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'mysql://root@localhost:3306/tab_account' } } });
const bcrypt = require('bcryptjs');

async function main() {
    const admin = await prisma.user.findUnique({ where: { email: 'superadmin@gmail.com' } });
    const is123 = await bcrypt.compare('123', admin.password);
    console.log('Superadmin password is "123"?', is123);
    const is123456 = await bcrypt.compare('123456', admin.password);
    console.log('Superadmin password is "123456"?', is123456);
}

main().finally(() => prisma.$disconnect());
