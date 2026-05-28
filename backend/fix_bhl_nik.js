const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  try {
    // Check if BHL-0001 exists in User but has no Employee
    const orphanedUser = await prisma.user.findUnique({ where: { username: 'BHL-0001' } });
    if (orphanedUser && !orphanedUser.employeeId) {
      await prisma.user.delete({ where: { id: orphanedUser.id } });
      console.log('Deleted orphaned User BHL-0001');
    }

    // Check if employee BHL-0002 exists
    const emp0002 = await prisma.employee.findFirst({ where: { employeeCode: 'BHL-0002' } });
    if (emp0002) {
      await prisma.employee.update({
        where: { id: emp0002.id },
        data: { employeeCode: 'BHL-0001' }
      });
      console.log('Updated BHL-0002 to BHL-0001');
      
      // Also update the User if it exists (though we just changed the code to not create users for BHL, 
      // let's be thorough just in case)
      const user0002 = await prisma.user.findFirst({ where: { employeeId: emp0002.id } });
      if (user0002) {
         await prisma.user.update({
            where: { id: user0002.id },
            data: { username: 'BHL-0001' }
         });
         console.log('Updated User BHL-0002 to BHL-0001');
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}
fix();
