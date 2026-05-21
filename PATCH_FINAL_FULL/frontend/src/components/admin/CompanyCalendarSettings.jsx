import { useState } from 'react';
import { Calendar, Save, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { calendarAPI } from '../../services/api';

const CompanyCalendarSettings = () => {
  const queryClient = useQueryClient();
  const [currentYear] = useState(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  const [form, setForm] = useState({ date: '', type: 'HOLIDAY', description: '' });

  const { data: calendarData, isLoading } = useQuery({
    queryKey: ['calendar', selectedYear, selectedMonth],
    queryFn: () => calendarAPI.getAll({ year: selectedYear, month: selectedMonth }),
  });

  const upsertMutation = useMutation({
    mutationFn: (data) => calendarAPI.upsert(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['calendar']);
      setForm({ date: '', type: 'HOLIDAY', description: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => calendarAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['calendar']);
    },
  });

  const handleUpsert = (e) => {
    e.preventDefault();
    if (!form.date || !form.description) return alert('Lengkapi data');
    upsertMutation.mutate(form);
  };

  const holidays = calendarData?.data || [];

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 font-medium leading-relaxed">
          Atur pengecualian kalender di sini. Anda bisa mengatur <b>Tanggal Merah (Cuti Bersama)</b> yang akan menimpa jadwal masuk normal, atau mengatur <b>Tukar Hari (Workday)</b> untuk mewajibkan absen pada hari yang secara default adalah hari libur (misal: masuk di hari Minggu).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-sm">
            <Plus className="w-4 h-4 text-emerald-500" /> Tambah Pengecualian
          </h3>
          <form onSubmit={handleUpsert} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Tanggal</label>
              <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700" required />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Tipe Pengecualian</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700">
                <option value="HOLIDAY">Tanggal Merah / Libur / Cuti Bersama</option>
                <option value="WORKDAY">Wajib Masuk (Tukar Hari Libur)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Keterangan</label>
              <input type="text" placeholder="Misal: Tahun Baru" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700" required />
            </div>
            <button disabled={upsertMutation.isLoading} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
              {upsertMutation.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan
            </button>
          </form>
        </div>

        <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-blue-500" /> Daftar Pengecualian Kalender
            </h3>
            <div className="flex gap-2">
              <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700">
                {Array.from({length: 12}, (_, i) => <option key={i+1} value={i+1}>{new Date(2000, i).toLocaleString('id-ID', {month:'long'})}</option>)}
              </select>
              <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700">
                {[currentYear-1, currentYear, currentYear+1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto bg-slate-50 rounded-xl border border-slate-100 p-2 max-h-64">
            {isLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
            ) : holidays.length === 0 ? (
              <div className="text-center p-8 text-xs text-slate-400 font-bold uppercase tracking-wider">Tidak ada pengecualian di bulan ini</div>
            ) : (
              <div className="space-y-2">
                {holidays.map(h => (
                  <div key={h.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${h.type === 'HOLIDAY' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                        {h.type === 'HOLIDAY' ? 'LIBUR' : 'MASUK'}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{new Date(h.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                        <p className="text-[10px] text-slate-500 font-semibold uppercase">{h.description}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteMutation.mutate(h.id)} disabled={deleteMutation.isLoading} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
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
