import { useState } from 'react';
import { Calendar, Save, Plus, Trash2, Loader2, AlertCircle, Edit } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { calendarAPI } from '../../services/api';

const CompanyCalendarSettings = () => {
  const queryClient = useQueryClient();
  const [currentYear] = useState(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [activeView, setActiveView] = useState('grid'); // 'grid' | 'list'

  const [form, setForm] = useState({ date: '', type: 'HOLIDAY', description: '' });

  const { data: calendarData, isLoading } = useQuery({
    queryKey: ['calendar', selectedYear, selectedMonth],
    queryFn: () => calendarAPI.getAll({ year: selectedYear, month: selectedMonth }),
  });

  const upsertMutation = useMutation({
    mutationFn: (data) => calendarAPI.upsert(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      setForm({ date: '', type: 'HOLIDAY', description: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => calendarAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  const handleUpsert = (e) => {
    e.preventDefault();
    if (!form.date || !form.description) return alert('Lengkapi data');
    upsertMutation.mutate(form);
  };

  const handleEdit = (holiday) => {
    // Parse ISO date back to YYYY-MM-DD local format
    const dateStr = holiday.date.split('T')[0];
    setForm({
      date: dateStr,
      type: holiday.type,
      description: holiday.description
    });
  };

  const parseLocalDateString = (dateStr) => {
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('id-ID', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const getDaysInMonth = (year, month) => {
    const firstDay = new Date(year, month - 1, 1);
    const days = [];
    const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Pad initial days of the week from the previous month
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    
    const lastDay = new Date(year, month, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      days.push(new Date(year, month - 1, d));
    }
    
    return days;
  };

  const holidays = calendarData?.data || [];
  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const weekdayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 font-medium leading-relaxed">
          Atur pengecualian kalender di sini. Anda bisa mengatur <b>Tanggal Merah (Cuti Bersama)</b> yang akan menimpa jadwal masuk normal, atau mengatur <b>Wajib Masuk (Tukar Hari)</b> untuk mewajibkan absen pada hari yang secara default adalah hari libur (misal: masuk di hari Minggu).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Form Panel */}
        <div className="md:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-sm">
            <Plus className="w-4 h-4 text-emerald-500" /> Atur Pengecualian
          </h3>
          <form onSubmit={handleUpsert} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Tanggal</label>
              <input 
                type="date" 
                value={form.date} 
                onChange={e => setForm({...form, date: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700" 
                required 
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Tipe Pengecualian</label>
              <select 
                value={form.type} 
                onChange={e => setForm({...form, type: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700"
              >
                <option value="HOLIDAY">Tanggal Merah / Libur / Cuti Bersama</option>
                <option value="WORKDAY">Wajib Masuk (Tukar Hari Libur)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Keterangan</label>
              <input 
                type="text" 
                placeholder="Misal: Tahun Baru" 
                value={form.description} 
                onChange={e => setForm({...form, description: e.target.value})} 
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700" 
                required 
              />
            </div>
            <button 
              type="submit"
              disabled={upsertMutation.isPending} 
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
            >
              {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
            </button>
          </form>
        </div>

        {/* Right View Panel */}
        <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-[400px]">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5 border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-blue-500" /> Kalender Perusahaan
            </h3>
            <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
              {/* Tab Selector */}
              <div className="flex border border-slate-200 bg-slate-50 p-0.5 rounded-lg mr-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveView('grid')}
                  className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all ${
                    activeView === 'grid' 
                      ? 'bg-white text-blue-600 shadow-xs border border-slate-200/50' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('list')}
                  className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all ${
                    activeView === 'list' 
                      ? 'bg-white text-blue-600 shadow-xs border border-slate-200/50' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Daftar
                </button>
              </div>

              {/* Month Selector */}
              <select 
                value={selectedMonth} 
                onChange={e => setSelectedMonth(Number(e.target.value))} 
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-700 focus:outline-none"
              >
                {Array.from({length: 12}, (_, i) => (
                  <option key={i+1} value={i+1}>
                    {new Date(2000, i).toLocaleString('id-ID', {month:'long'})}
                  </option>
                ))}
              </select>

              {/* Year Selector */}
              <select 
                value={selectedYear} 
                onChange={e => setSelectedYear(Number(e.target.value))} 
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-700 focus:outline-none"
              >
                {[currentYear-1, currentYear, currentYear+1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
            ) : activeView === 'grid' ? (
              /* Calendar Grid View */
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-150 animate-in fade-in duration-300">
                <div className="grid grid-cols-7 gap-1.5 text-center mb-2.5">
                  {weekdayNames.map(w => (
                    <div key={w} className={`text-[10px] font-bold uppercase py-1 ${w === 'Min' ? 'text-red-500' : 'text-slate-400'}`}>
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {daysInMonth.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="aspect-square bg-slate-100/30 rounded-xl border border-transparent" />;
                    
                    const year = day.getFullYear();
                    const month = String(day.getMonth() + 1).padStart(2, '0');
                    const dateNum = String(day.getDate()).padStart(2, '0');
                    const dateStr = `${year}-${month}-${dateNum}`;
                    
                    const exception = holidays.find(h => h.date.split('T')[0] === dateStr);
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    
                    let bgClass = "bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:bg-blue-50/40";
                    let label = "";
                    let labelClass = "";

                    if (exception) {
                      if (exception.type === 'HOLIDAY') {
                        bgClass = "bg-rose-50/90 border-rose-200 text-rose-700 hover:bg-rose-100/90 hover:border-rose-300 font-bold shadow-xs";
                        label = "LIBUR";
                        labelClass = "bg-rose-100/70 text-rose-700";
                      } else if (exception.type === 'WORKDAY') {
                        bgClass = "bg-emerald-50/90 border-emerald-200 text-emerald-700 hover:bg-emerald-100/90 hover:border-emerald-300 font-bold shadow-xs";
                        label = "MASUK";
                        labelClass = "bg-emerald-100/70 text-emerald-700";
                      }
                    } else if (isWeekend) {
                      bgClass = "bg-slate-100/50 border-slate-1.50 text-slate-400 hover:border-blue-300 hover:bg-blue-50/30";
                    }

                    const titleText = exception 
                      ? `${exception.description} (${exception.type === 'HOLIDAY' ? 'Libur' : 'Wajib Masuk'})` 
                      : (isWeekend ? "Akhir Pekan" : "Hari Kerja Normal");

                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => {
                          setForm({
                            date: dateStr,
                            type: exception?.type || 'HOLIDAY',
                            description: exception?.description || ''
                          });
                        }}
                        title={titleText}
                        className={`aspect-square flex flex-col items-center justify-between p-2 border rounded-2xl transition-all text-xs font-semibold relative focus:outline-none ${bgClass}`}
                      >
                        <span className={`self-start text-[10px] leading-none px-1.5 py-0.5 rounded-md ${isWeekend && !exception ? 'text-red-500' : ''}`}>{day.getDate()}</span>
                        {label ? (
                          <span className={`text-[7px] font-black tracking-wider px-1 py-0.5 rounded-sm ${labelClass} w-full text-center leading-none mt-1`}>
                            {label}
                          </span>
                        ) : (
                          <span className="h-2" />
                        )}
                        {exception && (
                          <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-current" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : holidays.length === 0 ? (
              /* List View Empty */
              <div className="text-center py-16 text-xs text-slate-400 font-bold uppercase tracking-wider border-2 border-dashed border-slate-100 rounded-2xl bg-slate-5/50">
                Tidak ada pengecualian di bulan ini
              </div>
            ) : (
              /* List View Grid */
              <div className="space-y-2 max-h-[380px] pr-1 overflow-y-auto animate-in fade-in duration-300">
                {holidays.map(h => (
                  <div key={h.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex justify-between items-center shadow-xs hover:border-slate-300 hover:shadow-sm transition-all duration-200">
                    <div className="flex items-center gap-4">
                      <div className={`px-2.5 py-1 rounded-md text-[9px] font-extrabold tracking-wider uppercase border ${
                        h.type === 'HOLIDAY' 
                          ? 'bg-rose-50 text-rose-600 border-rose-100' 
                          : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      }`}>
                        {h.type === 'HOLIDAY' ? 'LIBUR' : 'MASUK'}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{parseLocalDateString(h.date)}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">{h.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button 
                        type="button"
                        onClick={() => handleEdit(h)} 
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-slate-100 hover:border-blue-100"
                        title="Edit Pengecualian"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        type="button"
                        onClick={() => { if(confirm('Hapus pengecualian kalender ini?')) deleteMutation.mutate(h.id) }} 
                        disabled={deleteMutation.isPending} 
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-slate-100 hover:border-rose-100 disabled:opacity-50"
                        title="Hapus Pengecualian"
                      >
                        {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyCalendarSettings;
