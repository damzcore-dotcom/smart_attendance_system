const xlsx = require('xlsx');
const filePath = 'C:\\ADAM\\smart_attendance_system\\FINGER OFFICE APRIL.xls';

try {
  console.log(`🔍 Membaca file: ${filePath}`);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Ambil data mentah (raw) untuk melihat struktur kolom yang sebenarnya
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log('--- 20 BARIS PERTAMA FILE EXCEL ---');
  data.slice(0, 20).forEach((row, index) => {
    console.log(`Row ${index}:`, JSON.stringify(row));
  });
  console.log('-----------------------------------');
  
} catch (err) {
  console.error('❌ Gagal membaca file:', err.message);
}
