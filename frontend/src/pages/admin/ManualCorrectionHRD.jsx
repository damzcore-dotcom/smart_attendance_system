import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeAPI, attendanceAPI } from '../../services/api';
import { 
  Users, Save, Calendar, Search, Filter, Loader2, AlertCircle, Edit3, 
  Clock, CheckSquare, Image as ImageIcon, X 
} from 'lucide-react';

const ManualCorrectionHRD = () => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [rankFilter, setRankFilter] = useState('');
  
  const [activeTab, setActiveTab] = useState('KEHADIRAN'); // KEHADIRAN | LUPA_FINGER

  // State maps
  const [attendanceInputs, setAttendanceInputs] = useState({}); // { empId: 'SAKIT' }
  const [fingerInputs, setFingerInputs] = useState({}); // { empId: { checkIn: '', checkOut: '', photo: '' } }

  const { data: employeesData, isLoading: empLoading } = useQuery({
    queryKey: ['employees-for-correction'],
    queryFn: () => employeeAPI.getAll({ limit: 1000, status: 'ACTIVE' }),
  });

  const { data: attendanceData, isLoading: attLoading } = useQuery({
    queryKey: ['attendance-for-correction', selectedDate],
    queryFn: () => attendanceAPI.getAll({ date: selectedDate, limit: 1000 }),
  });

  const employees = employeesData?.data || [];

  const filteredEmployees = employees.filter(e => {
    if (deptFilter && e.department?.name !== deptFilter) return false;
    if (sectionFilter && e.section !== sectionFilter) return false;
    if (rankFilter && e.position !== rankFilter) return false;
    if (search) {
      const lower = search.toLowerCase();
      if (!e.name.toLowerCase().includes(lower) && !e.employeeCode.toLowerCase().includes(lower)) {
        return false;
      }
    }
    return true;
  });

  // Photo compression via canvas
  const handlePhotoUpload = (empId, e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // compress to high efficiency jpeg
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        
        setFingerInputs(prev => ({
          ...prev,
          [empId]: {
            ...prev[empId],
            photo: dataUrl
          }
        }));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const saveMutation = useMutation({
    mutationFn: (payload) => attendanceAPI.manualCorrection(payload),
    onSuccess: (res) => {
      alert(res.message);
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-for-correction'] });
      // Clear inputs
      setAttendanceInputs({});
      setFingerInputs({});
    },
    onError: (err) => {
      alert(`Gagal menyimpan: ${err.message}`);
    }
  });

  const handleSaveAll = () => {
    if (activeTab === 'KEHADIRAN') {
      const records = Object.keys(attendanceInputs)
        .filter(empId => attendanceInputs[empId] !== '' && attendanceInputs[empId] !== undefined)
        .map(empId => ({
          employeeId: parseInt(empId),
          status: attendanceInputs[empId]
        }));
      
      if (records.length === 0) return alert('Belum ada data kehadiran yang diubah.');
      if (window.confirm(`Simpan manual koreksi kehadiran untuk ${records.length} karyawan?`)) {
        saveMutation.mutate({ type: 'KEHADIRAN', date: selectedDate, records });
      }
    } else {
      const records = Object.keys(fingerInputs)
        .filter(empId => fingerInputs[empId]?.checkIn || fingerInputs[empId]?.checkOut)
        .map(empId => ({
          employeeId: parseInt(empId),
          checkIn: fingerInputs[empId].checkIn || null,
          checkOut: fingerInputs[empId].checkOut || null,
          photo: fingerInputs[empId].photo || null
        }));
      
      if (records.length === 0) return alert('Belum ada data waktu lupa finger yang diisi.');
      if (window.confirm(`Simpan manual jam lupa finger untuk ${records.length} karyawan?`)) {
        saveMutation.mutate({ type: 'LUPA_FINGER', date: selectedDate, records });
      }
    }
  };

  const isLoading = empLoading || attLoading;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="px-1 space-y-3">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
            <Edit3 className="w-3 h-3 text-rose-500" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider">Attendance Admin</span>
          <div className="w-1 h-1 rounded-full bg-slate-300" />
          <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Koreksi Manual</span>
        </div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between w-full gap-4">
          <div>
            <h1 className="text-2xl xl:text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              Koreksi Manual HRD
            </h1>
            <p className="text-xs text-slate-500 mt-1">Direct override untuk rekayasa status absensi dan revisi lupa finger</p>
          </div>
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="flex items-center gap-3 min-w-max">
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-rose-600" />
            </div>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">TANGGAL KOREKSI:</label>
          </div>
          <div className="flex items-center bg-slate-50 p-1.5 rounded-xl border border-slate-200">
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent px-4 py-2 text-sm font-bold text-slate-700 outline-none uppercase tracking-wider"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6 items-end bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">PERSONNEL FILTER</label>
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-rose-500 transition-colors" />
              <input 
                type="text" 
                placeholder="ID SEQUENCE / NAMA..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-[10px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-rose-500 placeholder:text-slate-400 shadow-sm transition-all uppercase tracking-wider"
              />
            </div>
          </div>

          {[
            { label: 'DEPARTMENT', val: deptFilter, setter: setDeptFilter, opts: [...new Set((employees || []).map(e => e.department?.name).filter(Boolean))] },
            { label: 'SECTION', val: sectionFilter, setter: setSectionFilter, opts: [...new Set((employees || []).map(e => e.section).filter(Boolean))] },
            { label: 'RANK', val: rankFilter, setter: setRankFilter, opts: [...new Set((employees || []).map(e => e.position).filter(Boolean))] }
          ].map((field, idx) => (
            <div key={idx} className="space-y-2">
              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider ml-1">{field.label}</label>
              <div className="relative">
                <select 
                  value={field.val}
                  onChange={(e) => field.setter(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-4 pr-10 py-3 text-[10px] font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500 cursor-pointer appearance-none uppercase tracking-wider shadow-sm truncate transition-all"
                >
                  <option value="">GLOBAL ARCHIVE</option>
                  {field.opts.map((o, i) => <option key={i} value={o}>{o}</option>)}
                </select>
                <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl w-max border border-slate-200">
        <button 
          onClick={() => setActiveTab('KEHADIRAN')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${activeTab === 'KEHADIRAN' ? 'bg-white text-rose-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <CheckSquare className="w-4 h-4" />
          Koreksi Kehadiran
        </button>
        <button 
           onClick={() => setActiveTab('LUPA_FINGER')}
           className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all uppercase tracking-wider ${activeTab === 'LUPA_FINGER' ? 'bg-white text-rose-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-800'}`}
        >
          <Clock className="w-4 h-4" />
          Koreksi Lupa Finger
        </button>
      </div>

      {/* Grid */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-2xl relative">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Spreadsheet Koreksi <span className="text-slate-300 mx-2">|</span> 
              Menampilkan {filteredEmployees.length} Karyawan
            </p>
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
           <table className="w-full text-left whitespace-nowrap">
             <thead className="bg-slate-50 border-b border-slate-100">
               <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                 <th className="px-6 py-4 w-12 text-center">No</th>
                 <th className="px-6 py-4">Karyawan</th>
                 <th className="px-4 py-4">Departemen</th>
                 
                 {activeTab === 'KEHADIRAN' ? (
                   <th className="px-6 py-4 text-center bg-rose-50/50 text-rose-700">Override Status</th>
                 ) : (
                   <>
                     <th className="px-6 py-4 text-center bg-rose-50/50 text-rose-700">Check In</th>
                     <th className="px-6 py-4 text-center bg-rose-50/50 text-rose-700">Check Out</th>
                     <th className="px-6 py-4 text-center bg-rose-50/50 text-rose-700">Bukti Foto Lupa Finger</th>
                   </>
                 )}
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-20">
                      <Loader2 className="w-8 h-8 animate-spin text-rose-600 mx-auto mb-3" />
                      <p className="text-xs font-bold text-slate-400">Loading Data...</p>
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-20 text-slate-400 text-xs">
                      Tidak ada Karyawan ditemukan
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map((emp, index) => (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-center text-xs text-slate-400 font-medium">{index + 1}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-800 uppercase">{emp.name}</span>
                          <span className="text-[10px] text-slate-500">{emp.employeeCode}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs font-medium text-slate-600">
                        {emp.department?.name || 'UMUM'}
                      </td>

                      {activeTab === 'KEHADIRAN' ? (
                        <td className="px-6 py-4 text-center bg-rose-50/10 group-hover:bg-rose-50/50 transition-colors">
                          <select
                            value={attendanceInputs[emp.id] || ''}
                            onChange={(e) => setAttendanceInputs(prev => ({ ...prev, [emp.id]: e.target.value }))}
                            className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500 uppercase cursor-pointer"
                          >
                            <option value="">- Tidak Dirubah -</option>
                            <option value="PRESENT">HADIR NORMAL</option>
                            <option value="IZIN">IZIN</option>
                            <option value="SAKIT">SAKIT</option>
                            <option value="CUTI">CUTI</option>
                            <option value="HOLIDAY">LIBUR / OFF</option>
                            <option value="ABSENT">ALPA (TIDAK HADIR)</option>
                          </select>
                        </td>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-center bg-rose-50/10 group-hover:bg-rose-50/50 transition-colors border-r border-white">
                            <input
                              type="time"
                              value={fingerInputs[emp.id]?.checkIn || ''}
                              onChange={(e) => setFingerInputs(prev => ({ ...prev, [emp.id]: { ...prev[emp.id], checkIn: e.target.value } }))}
                              className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                            />
                          </td>
                          <td className="px-6 py-4 text-center bg-rose-50/10 group-hover:bg-rose-50/50 transition-colors border-r border-white">
                            <input
                              type="time"
                              value={fingerInputs[emp.id]?.checkOut || ''}
                              onChange={(e) => setFingerInputs(prev => ({ ...prev, [emp.id]: { ...prev[emp.id], checkOut: e.target.value } }))}
                              className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:ring-2 focus:ring-rose-500 outline-none"
                            />
                          </td>
                          <td className="px-6 py-4 text-center bg-rose-50/10 group-hover:bg-rose-50/50 transition-colors">
                             <div className="flex items-center justify-center gap-3">
                               {fingerInputs[emp.id]?.photo ? (
                                 <div className="relative group/img">
                                    <img src={fingerInputs[emp.id].photo} alt="Bukti" className="h-10 w-10 object-cover rounded-lg border-2 border-rose-200" />
                                    <button 
                                      onClick={() => setFingerInputs(prev => { const n = {...prev}; n[emp.id].photo = null; return n; })}
                                      className="absolute -top-2 -right-2 bg-rose-500 text-white rounded-full p-0.5 opacity-0 group-hover/img:opacity-100 transition-opacity"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                 </div>
                               ) : (
                                 <label className="flex flex-col items-center justify-center w-10 h-10 border-2 border-dashed border-rose-300 rounded-lg cursor-pointer bg-white hover:bg-rose-50 transition-colors">
                                   <ImageIcon className="w-4 h-4 text-rose-400" />
                                   <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(emp.id, e)} />
                                 </label>
                               )}
                             </div>
                          </td>
                        </>
                      )}

                    </tr>
                  ))
                )}
             </tbody>
           </table>
        </div>
      </div>

      {/* Floating Save Bar */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-slate-200 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] p-4 px-6 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center">
             <AlertCircle className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase">Perubahan Disimpan</p>
            <p className="text-sm font-bold text-slate-800">
              {activeTab === 'KEHADIRAN' 
                 ? Object.keys(attendanceInputs).filter(k => attendanceInputs[k]).length 
                 : Object.keys(fingerInputs).filter(k => fingerInputs[k]?.checkIn || fingerInputs[k]?.checkOut).length
              } Data Koreksi Siap
            </p>
          </div>
        </div>
        
        <button
          onClick={handleSaveAll}
          disabled={saveMutation.isPending}
          className="bg-rose-600 hover:bg-rose-700 text-white px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-lg hover:shadow-xl hover:shadow-rose-500/20 active:scale-95 transition-all outline-none"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>Jalankan Koreksi ({activeTab})</span>
        </button>
      </div>
    </div>
  );
};

export default ManualCorrectionHRD;
