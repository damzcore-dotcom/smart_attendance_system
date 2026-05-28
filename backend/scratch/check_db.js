const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const emp = await prisma.employee.findFirst({
    where: { name: { contains: 'Hana Nurhasanah', mode: 'insensitive' } }
  });

  if (!emp) {
    console.log('Employee not found');
    return;
  }

  console.log('Employee found:', { id: emp.id, name: emp.name, code: emp.employeeCode });

  const records = await prisma.attendance.findMany({
    where: { employeeId: emp.id },
    orderBy: { date: 'desc' },
    take: 20
  });

  console.log('Attendance records (last 20):');
  records.forEach(r => {
    console.log({
      id: r.id,
      date: r.date.toISOString(),
      checkIn: r.checkIn ? r.checkIn.toISOString() : null,
      checkOut: r.checkOut ? r.checkOut.toISOString() : null,
      status: r.status,
      notes: r.notes
    });
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
