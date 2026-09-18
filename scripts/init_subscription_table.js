const prisma = require('../src/config/prisma');

async function init() {
  try {
    console.log('Ensuring subscription table exists in database...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`subscription\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`companyId\` INT NOT NULL,
        \`planId\` INT NULL,
        \`startDate\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`expiryDate\` DATETIME(3) NOT NULL,
        \`billingCycle\` VARCHAR(191) NOT NULL DEFAULT 'Monthly',
        \`amount\` DOUBLE NOT NULL DEFAULT 0,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'ACTIVE',
        \`paymentReference\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`Subscription_companyId_idx\` (\`companyId\`),
        INDEX \`Subscription_planId_idx\` (\`planId\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log('✅ subscription table created / verified');

    const count = await prisma.subscription.count();
    console.log('Current subscription records count:', count);
  } catch (err) {
    console.error('❌ Failed to initialize subscription table:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

init();
