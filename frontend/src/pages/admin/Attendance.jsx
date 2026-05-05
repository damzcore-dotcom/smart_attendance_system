import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { attendanceAPI, employeeAPI } from '../../services/api';
import { 
  Calendar, Search, Download, Filter, CheckCircle2, XCircle, Clock, 
  ArrowRight, Scan, Upload, FileSpreadsheet, X, Loader2, AlertCircle, RefreshCw,
  FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const Attendance = () => {
  const queryClient = useQueryClient();
  const [filterDate, setFilterDate] = useState('Today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isImportOpen, setImportOpen] = useState(false);
  const [isRecalcModalOpen, setRecalcModalOpen] = useState(false);
  const [recalcRange, setRecalcRange] = useState({ start: '', end: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance', { period: filterDate, startDate: customStart, endDate: customEnd, dept: filterDept, section: filterSection, position: filterPosition, search: searchQuery }],
    queryFn: () => attendanceAPI.getAll({ 
      period: filterDate, 
      startDate: customStart, 
      endDate: customEnd, 
      dept: filterDept, 
      section: filterSection, 
      position: filterPosition, 
      search: searchQuery 
    }),
  });

  const { data: optionsData } = useQuery({
    queryKey: ['attendance-options', { period: filterDate, startDate: customStart, endDate: customEnd, dept: filterDept }],
    queryFn: () => attendanceAPI.getMasterOptions({ 
      period: filterDate, 
      startDate: customStart, 
      endDate: customEnd, 
      dept: filterDept 
    }),
  });

  const masterOptions = optionsData?.data || { departments: [], sections: [], positions: [] };

  const filteredData = data?.data || [];

  const handleRecalculate = async () => {
    if (!recalcRange.start || !recalcRange.end) {
      alert('Pilih rentang tanggal terlebih dahulu.');
      return;
    }
    
    setIsRecalculating(true);
    try {
      const res = await attendanceAPI.recalculate(recalcRange.start, recalcRange.end);
      alert(res.message);
      setRecalcModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    setImportResult(null);
    try {
      const res = await attendanceAPI.importExcel(file);
      setImportResult(res);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
    } catch (err) {
      setImportResult({ success: false, message: err.message });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleExportExcel = () => {
    const exportData = filteredData.map(row => ({
      'Employee Name': row.name,
      'Department': row.dept,
      'Section': row.section,
      'Position': row.position,
      'Date': row.date,
      'Check In': row.checkIn,
      'Check Out': row.checkOut,
      'Late Minutes': row.lateMinutes,
      'Status': row.status,
      'Mode': row.mode
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `Attendance_Report_${filterDate}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(0, 108, 73); // Primary color
    doc.text('SMART ATTENDANCE PRO', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Report Period: ${filterDate} (${customStart || '-'} to ${customEnd || '-'})`, 14, 28);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 33);

    // Summary Box
    const total = filteredData.length;
    const late = filteredData.filter(r => r.status === 'Late').length;
    
    doc.setDrawColor(230);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(pageWidth - 80, 15, 66, 22, 3, 3, 'FD');
    
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('SUMMARY STATISTICS', pageWidth - 76, 21);
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text(`Total: ${total} | Late: ${late}`, pageWidth - 76, 28);

    // Table
    const tableData = filteredData.map(row => [
      row.name,
      row.dept,
      row.section,
      row.position,
      row.date,
      row.checkIn,
      row.checkOut,
      `${row.lateMinutes} min`,
      row.status
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['Employee', 'Dept', 'Section', 'Position', 'Date', 'In', 'Out', 'Late', 'Status']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [0, 108, 73], fontSize: 8, halign: 'center' },
      styles: { fontSize: 7, cellPadding: 2 },
      columnStyles: {
        7: { halign: 'center', fontStyle: 'bold' },
        8: { halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.column.index === 8 && data.cell.section === 'body') {
          const val = data.cell.raw;
          if (val === 'Late') data.cell.styles.textColor = [225, 29, 72];
          if (val === 'Present') data.cell.styles.textColor = [5, 150, 105];
        }
      }
    });

    doc.save(`Attendance_Report_${new Date().getTime()}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Attendance Records</h1>
          <p className="text-slate-500 mt-1">Review and audit daily attendance logs.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setRecalcModalOpen(true)} 
            disabled={isRecalculating}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-primary ${isRecalculating ? 'animate-spin' : ''}`} />
            Recalculate
          </button>
          <button 
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-100 border border-emerald-100 transition-all shadow-sm"
          >
            <Upload className="w-4 h-4" /> Import Fingerprint
          </button>
          <button 
            onClick={handleExportPDF}
            className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all hover:border-rose-200 hover:text-rose-600"
          >
            <FileText className="w-4 h-4 text-rose-500" /> Download PDF
          </button>
          <button 
            onClick={handleExportExcel}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export Excel
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card p-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-slate-100">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">Periode Waktu:</label>
            {['Today', 'This Week', 'This Month', 'Custom'].map((period) => (
              <button
                key={period}
                onClick={() => setFilterDate(period)}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                  filterDate === period 
                    ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' 
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {period}
              </button>
            ))}

            {filterDate === 'Custom' && (
              <div className="flex items-center gap-2 animate-in slide-in-from-left-4 duration-300 ml-4">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase ml-1">Dari</span>
                  <input 
                    type="date" 
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold text-slate-600"
                  />
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 mt-4" />
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase ml-1">Sampai</span>
                  <input 
                    type="date" 
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold text-slate-600"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Search Employee</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Nama atau NIK..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Departemen</label>
              <select 
                value={filterDept}
                onChange={(e) => { setFilterDept(e.target.value); setFilterSection(''); setFilterPosition(''); }}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 font-bold cursor-pointer transition-all"
              >
                <option value="">Semua Departemen</option>
                {masterOptions.departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Bagian (Section)</label>
              <select 
                value={filterSection}
                onChange={(e) => setFilterSection(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 font-bold cursor-pointer transition-all"
              >
                <option value="">Semua Bagian</option>
                {masterOptions.sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block ml-1">Jabatan (Position)</label>
              <select 
                value={filterPosition}
                onChange={(e) => setFilterPosition(e.target.value)}
                className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-slate-600 font-bold cursor-pointer transition-all"
              >
                <option value="">Semua Jabatan</option>
                {masterOptions.positions.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Attendance Table */}
      <div className="card shadow-xl shadow-slate-200/50">
        <div className="overflow-auto max-h-[600px] relative">
          <table className="w-full text-left border-separate border-spacing-0">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-50/95 backdrop-blur-sm text-slate-400 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4 border-b border-slate-100 first:rounded-tl-xl">Karyawan</th>
                <th className="px-6 py-4 border-b border-slate-100">Departemen</th>
                <th className="px-6 py-4 border-b border-slate-100">Bagian</th>
                <th className="px-6 py-4 border-b border-slate-100">Jabatan</th>
                <th className="px-6 py-4 border-b border-slate-100">Tanggal</th>
                <th className="px-6 py-4 border-b border-slate-100">Masuk</th>
                <th className="px-6 py-4 border-b border-slate-100">Keluar</th>
                <th className="px-6 py-4 border-b border-slate-100">Keterlambatan</th>
                <th className="px-6 py-4 border-b border-slate-100 last:rounded-tr-xl">Status</th>
              </tr>
            </thead>
          <tbody className="divide-y divide-slate-50">
            {isLoading ? (
                <tr><td colSpan="7" className="text-center py-8 text-slate-500">Loading attendance data...</td></tr>
              ) : filteredData.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-8 text-slate-500">No attendance records found.</td></tr>
              ) : filteredData.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-primary font-bold text-xs border border-slate-200">
                      {row.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="font-bold text-slate-800 text-sm block">{row.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-xs font-bold text-slate-500">{row.dept || '-'}</td>
                <td className="px-6 py-4 text-xs font-bold text-slate-500">{row.section || '-'}</td>
                <td className="px-6 py-4 text-xs font-bold text-slate-500">{row.position || '-'}</td>
                <td className="px-6 py-4 text-sm text-slate-600 font-medium">{row.date}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm font-bold text-slate-700">{row.checkIn}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-300" />
                    <span className="text-sm font-bold text-slate-700">{row.checkOut}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className={`text-xs font-bold ${row.status === 'Late' ? 'text-amber-500' : 'text-slate-400'}`}>
                      {row.status === 'Late' ? `${row.lateMinutes} min` : '0 min'}
                    </span>
                    <span className="text-[10px] text-slate-400">Late Time</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                    <Scan className="w-3.5 h-3.5" />
                    {row.mode}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                    row.status === 'Present' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                    row.status === 'Late' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                    'bg-rose-50 text-rose-600 border border-rose-100'
                  }`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* Import Modal - Professional Overhaul */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md" onClick={() => !isUploading && setImportOpen(false)} />
          
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl relative z-10 overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-300">
            {/* Header Area */}
            <div className="px-8 py-6 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100 flex justify-between items-center relative">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center border border-emerald-100 shadow-sm">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Sinkronisasi Fingerprint</h3>
                  <p className="text-xs text-slate-400 font-medium">Import data kehadiran dari mesin finger</p>
                </div>
              </div>
              <button 
                onClick={() => !isUploading && setImportOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-8">
              {!importResult && !isUploading ? (
                <div className="space-y-6">
                  {/* Instructions Card */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Scan className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-[11px] font-bold text-slate-600 uppercase">Metode</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Pencocokan via <b>ID Number</b> ke NIK Database.</p>
                    </div>
                    <div className="bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[11px] font-bold text-slate-600 uppercase">Periode</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">Multi-tanggal didukung dalam satu file Excel.</p>
                    </div>
                  </div>

                  {/* Upload Dropzone */}
                  <label className="group block relative cursor-pointer">
                    <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleImport} />
                    <div className="border-2 border-dashed border-slate-200 rounded-[2rem] p-10 flex flex-col items-center transition-all group-hover:border-emerald-400 group-hover:bg-emerald-50/30 group-hover:shadow-inner">
                      <div className="w-16 h-16 bg-white rounded-3xl shadow-sm border border-slate-100 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                        <Upload className="w-8 h-8 text-emerald-500" />
                      </div>
                      <h4 className="font-bold text-slate-700">Pilih File Laporan</h4>
                      <p className="text-sm text-slate-400 mt-1">Sertakan file .xls atau .xlsx hasil tarik data</p>
                      
                      <div className="mt-6 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold shadow-lg shadow-slate-900/20 group-hover:bg-emerald-600 transition-colors">
                        Browse Files
                      </div>
                    </div>
                  </label>
                </div>
              ) : isUploading ? (
                <div className="py-12 flex flex-col items-center justify-center">
                  <div className="relative mb-6">
                    <div className="w-20 h-20 border-4 border-slate-100 rounded-full" />
                    <div className="w-20 h-20 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin absolute inset-0" />
                    <Loader2 className="w-8 h-8 text-emerald-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <h4 className="font-bold text-slate-800 mb-1">Sedang Memproses Laporan</h4>
                  <p className="text-sm text-slate-400">Harap jangan menutup jendela ini</p>
                  
                  <div className="w-full max-w-xs mt-8 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-emerald-500 h-full w-2/3 animate-pulse rounded-full" />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Result Header */}
                  <div className={`p-4 rounded-2xl flex items-center gap-3 ${importResult.success ? 'bg-emerald-50 border border-emerald-100' : 'bg-rose-50 border border-rose-100'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${importResult.success ? 'bg-white text-emerald-600 shadow-sm' : 'bg-white text-rose-600 shadow-sm'}`}>
                      {importResult.success ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                    </div>
                    <div>
                      <h4 className={`font-bold text-sm ${importResult.success ? 'text-emerald-800' : 'text-rose-800'}`}>Import Selesai</h4>
                      <p className="text-xs text-slate-500">{importResult.message}</p>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-slate-50 p-4 rounded-[1.5rem] border border-slate-100 flex flex-col items-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Records</span>
                      <span className="text-2xl font-black text-slate-800">{importResult.data?.totalRows || 0}</span>
                    </div>
                    <div className="bg-emerald-50/50 p-4 rounded-[1.5rem] border border-emerald-100 flex flex-col items-center">
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Berhasil</span>
                      <span className="text-2xl font-black text-emerald-600">{importResult.data?.imported || 0}</span>
                    </div>
                    <div className="bg-blue-50/50 p-4 rounded-[1.5rem] border border-blue-100 flex flex-col items-center">
                      <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-1">Updated</span>
                      <span className="text-2xl font-black text-blue-600">{importResult.data?.updated || 0}</span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-[1.5rem] border border-slate-100 flex flex-col items-center opacity-60">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Dilewati</span>
                      <span className="text-2xl font-black text-slate-500">{importResult.data?.skipped || 0}</span>
                    </div>
                  </div>

                  {importResult.data?.unmatched?.length > 0 && (
                    <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
                      <p className="text-[11px] font-bold text-amber-700 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                        <AlertCircle className="w-3 h-3" /> Unknown ID (Perlu Didaftarkan)
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {importResult.data.unmatched.map((id, idx) => (
                          <span key={idx} className="px-2 py-0.5 bg-white border border-amber-200 rounded-md text-[10px] font-bold text-amber-600">
                            {id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <button 
                    onClick={() => setImportResult(null)}
                    className="w-full py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-colors shadow-xl shadow-slate-900/10"
                  >
                    Import File Lain
                  </button>
                </div>
              )}
            </div>

            {/* Footer Tip */}
            <div className="px-8 py-4 bg-slate-50/50 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400 font-medium italic">
                Tips: Pastikan kolom ID Number sesuai dengan NIK yang terdaftar di database.
              </p>
            </div>
          </div>
        </div>
      )}
      {/* Recalculate Range Modal */}
      {isRecalcModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isRecalculating && setRecalcModalOpen(false)}></div>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-slate-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-primary" />
                Recalculate Lateness
              </h3>
              <button onClick={() => !isRecalculating && setRecalcModalOpen(false)}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="bg-primary/5 border border-primary/10 p-4 rounded-2xl flex gap-3">
                <AlertCircle className="w-5 h-5 text-primary shrink-0" />
                <p className="text-xs text-primary/80 leading-relaxed font-medium">
                  Gunakan fitur ini jika ada perubahan pada aturan <b>Shift</b> dan Anda ingin menyesuaikan data keterlambatan yang sudah ada.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tanggal Mulai</label>
                  <input 
                    type="date" 
                    value={recalcRange.start}
                    onChange={(e) => setRecalcRange({...recalcRange, start: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold text-slate-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tanggal Akhir</label>
                  <input 
                    type="date" 
                    value={recalcRange.end}
                    onChange={(e) => setRecalcRange({...recalcRange, end: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 font-bold text-slate-700"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex gap-3">
              <button 
                onClick={() => setRecalcModalOpen(false)}
                className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button 
                disabled={isRecalculating}
                onClick={handleRecalculate}
                className="flex-1 py-3 bg-slate-900 text-white text-sm font-bold rounded-xl shadow-lg shadow-slate-900/20 hover:bg-slate-800 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {isRecalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {isRecalculating ? 'Memproses...' : 'Mulai Hitung'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Attendance;
