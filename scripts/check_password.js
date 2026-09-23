const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'mysql://root@localhost:3306/tab_account' } } });
const bcrypt = require('bcryptjs');

async function main() {
    const user = await prisma.user.findUnique({ where: { email: 'company@gmail.com' } });
    console.log('User found:', user?.email, 'Password Hash:', user?.password);
    const passwordsToTest = ['123456', 'password', 'admin123', '12345678', 'company123', 'admin', 'james123', 'admin@123', 'Company@123'];
    let found = false;
    for (const p of passwordsToTest) {
        const match = await bcrypt.compare(p, user.password);
        if (match) {
            console.log('MATCH FOUND! Password is:', p);
            found = true;
            break;
        }
    }
    if (!found) {
        console.log('None of the common passwords matched the hash.');
    }
}

main()
    .catch(err => console.error(err))
    .finally(() => prisma.$disconnect());
