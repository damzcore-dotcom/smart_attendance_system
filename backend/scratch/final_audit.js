const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function audit() {
  let log = '';
  try {
    const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    log += `Tables: ${JSON.stringify(tables)}\n`;
    
    for (const t of tables) {
      const cols = await prisma.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_name = '${t.table_name}'`);
      log += `Columns in ${t.table_name}: ${JSON.stringify(cols)}\n`;
    }
  } catch (err) {
    log += `Error: ${err.message}\n`;
  } finally {
    fs.writeFileSync('scratch/audit_result.txt', log);
    await prisma.$disconnect();
  }
}

audit();
