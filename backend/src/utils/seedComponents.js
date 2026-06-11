const prisma = require('../prismaClient');

async function seedComponents() {
  console.log('[System] Seeding default HRIS salary components...');
  const defaultComponents = [
    {
      name: 'BPJS Kesehatan',
      type: 'DEDUCTION',
      isFixed: false,
      defaultValue: 1.0,
      calculationType: 'CONDITIONAL',
      isTaxable: false,
      sortOrder: 10,
    },
    {
      name: 'BPJS Ketenagakerjaan (JHT)',
      type: 'DEDUCTION',
      isFixed: false,
      defaultValue: 2.0,
      calculationType: 'CONDITIONAL',
      isTaxable: false,
      sortOrder: 11,
    },
    {
      name: 'BPJS Ketenagakerjaan (JP)',
      type: 'DEDUCTION',
      isFixed: false,
      defaultValue: 1.0,
      calculationType: 'CONDITIONAL',
      isTaxable: false,
      sortOrder: 12,
    },
    {
      name: 'PPh 21',
      type: 'DEDUCTION',
      isFixed: true,
      defaultValue: 0,
      calculationType: 'CONDITIONAL',
      isTaxable: false,
      sortOrder: 13,
    },
  ];

  try {
    for (const comp of defaultComponents) {
      await prisma.salaryComponent.upsert({
        where: { name: comp.name },
        update: {},
        create: comp,
      });
    }
    console.log('[System] Default HRIS salary components seeded successfully.');
  } catch (error) {
    console.error('[System] Error seeding components:', error);
  }
}

module.exports = seedComponents;
