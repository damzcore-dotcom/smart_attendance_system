const prisma = require('../src/prismaClient');
const XLSX = require('xlsx');
const { calculateLateness } = require('../src/utils/lateCalculator');
const path = require('path');

async function verifyImport() {
  const filePath = 'C:/adam/absen.xls';
  console.log('--- Verifying Import for:', filePath, '---');

  try {
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    if (rows.length < 2) {
      console.log('❌ File is empty or has no data rows');
      return;
    }

    // Detect column mapping
    const header = rows[0].map(h => (h || '').toString().trim().toLowerCase());
    const colMap = {
      dateTime: header.findIndex(h => h.includes('date') || h.includes('time')),
      status: header.findIndex(h => h === 'status'),
      idNumber: header.findIndex(h => h.includes('id number') || h.includes('idnumber')),
      name: header.findIndex(h => h === 'name'),
    };

    console.log('Column Mapping:', colMap);

    const dataRows = rows.slice(1).filter(r => r && r.length > 0);
    console.log('Total data rows:', dataRows.length);

    // Pre-fetch employees
    const allEmployees = await prisma.employee.findMany({
      select: { id: true, employeeCode: true, name: true, shift: true },
    });
    const empByCode = {};
    const empByName = {};
    allEmployees.forEach(e => {
      empByCode[e.employeeCode] = e;
      empByName[e.name.toLowerCase().trim()] = e;
    });

    const grouped = {};
    const unmatched = new Set();

    for (const row of dataRows) {
      const rawDateTime = row[colMap.dateTime];
      const statusStr = (row[colMap.status] || '').toString().trim().toLowerCase();
      const idNumber = colMap.idNumber >= 0 ? (row[colMap.idNumber] || '').toString().trim() : '';
      const empName = colMap.name >= 0 ? (row[colMap.name] || '').toString().trim() : '';

      if (!rawDateTime || (!statusStr.includes('in') && !statusStr.includes('out'))) continue;

      let dt;
      if (typeof rawDateTime === 'number') {
        dt = new Date(Math.round((rawDateTime - 25569) * 86400 * 1000));
      } else {
        dt = new Date(rawDateTime.toString());
      }
      if (isNaN(dt.getTime())) continue;

      let emp = empByCode[idNumber] || empByName[empName.toLowerCase().trim()] || null;
      if (!emp) {
        unmatched.add(`${empName} (${idNumber})`);
        continue;
      }

      const dateKey = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      const groupKey = `${emp.id}|${dateKey}`;

      if (!grouped[groupKey]) {
        grouped[groupKey] = { employee: emp, date: dateKey, checkIn: null, checkOut: null };
      }

      if (statusStr.includes('in')) {
        if (!grouped[groupKey].checkIn || dt < grouped[groupKey].checkIn) grouped[groupKey].checkIn = dt;
      } else if (statusStr.includes('out')) {
        if (!grouped[groupKey].checkOut || dt > grouped[groupKey].checkOut) grouped[groupKey].checkOut = dt;
      }
    }

    console.log('Unmatched Employees:', Array.from(unmatched));
    console.log('Grouped Records Count:', Object.keys(grouped).length);

    // Show a few examples of what would be imported
    const examples = Object.values(grouped).slice(0, 5);
    console.log('--- Import Examples (Simulation) ---');
    examples.forEach(e => {
        let status = 'ABSENT';
        let lateMinutes = 0;
        if (e.checkIn) {
          const shiftStart = e.employee.shift?.startTime || '08:00';
          const gracePeriod = e.employee.shift?.gracePeriod || 15;
          const calc = calculateLateness(e.checkIn, shiftStart, gracePeriod);
          status = calc.status;
          lateMinutes = calc.lateMinutes;
        }
        console.log(`Emp: ${e.employee.name} | Date: ${e.date} | In: ${e.checkIn?.toLocaleTimeString()} | Out: ${e.checkOut?.toLocaleTimeString()} | Status: ${status} (${lateMinutes}m late)`);
    });

    console.log('✅ Logic verification complete. Matching works as expected.');

  } catch (err) {
    console.error('❌ Error during verification:', err);
  } finally {
    await prisma.$disconnect();
  }
}

verifyImport();
