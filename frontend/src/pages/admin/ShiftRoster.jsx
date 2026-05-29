import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeAPI, settingsAPI } from '../../services/api'; // I'll check exact imports after
import { Calendar, Users, Save, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { scheduleAPI } from '../../services/api';

const ShiftRoster = () => {
  const queryClient = useQueryClient();
  const [selectedEmployees, setSelectedEmployees] = useState(new Set());
  const [targetShift, setTargetShift] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const { data: employeesData, isLoading: empLoading } = useQuery({
    queryKey: ['employees', { page: 1, limit: 1000, excludeBhl: true }],
    queryFn: () => employeeAPI.getAll({ page: 1, limit: 1000, excludeBhl: true })
  });

  const { data: shiftsData, isLoading: shiftLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => settingsAPI.getShifts()
  });

  const { data: overridesData, isLoading: overridesLoading } = useQuery({
    queryKey: ['shift-overrides'],
    queryFn: () => scheduleAPI.getOverrides() // Need to add this
  });

  const createOverrideMutation = useMutation({
    mutationFn: (data) => scheduleAPI.createOverrides(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-overrides'] });
      setSelectedEmployees(new Set());
      alert('Shift rolling berhasil disimpan!');
    },
    onError: (err) => alert(err.response?.data?.message || 'Gagal menyimpan rolling')
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: (id) => scheduleAPI.deleteOverride(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shift-overrides'] })
  });

  const employees = employeesData?.data || [];
  const shifts = shiftsData?.data || [];
  const overrides = overridesData?.data || [];

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedEmployees(new Set(employees.map(e => e.id.toString())));
    else setSelectedEmployees(new Set());
  };

  const handleSelectEmp = (id) => {
    const next = new Set(selectedEmployees);
    if (next.has(id.toString())) next.delete(id.toString());
    else next.add(id.toString());
    setSelectedEmployees(next);
  };

  const handleApply = () => {
    if (selectedEmployees.size === 0 || !targetShift || !startDate || !endDate) {
      return alert('Harap lengkapi semua pilihan (Karyawan, Shift, dan Tanggal)');
    }
    createOverrideMutation.mutate({
      employeeIds: Array.from(selectedEmployees),
      shiftId: targetShift,
      startDate,
      endDate
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold flex items-center gap-3 mb-6"><Calendar className="text-blue-600"/> Setup Rolling Shift Sementara (Override)</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Target Shift Ganti</label>
            <select value={targetShift} onChange={(e) => setTargetShift(e.target.value)} className="w-full mt-2 p-3 border rounded-xl bg-slate-50">
               <option value="">-- Pilih Shift --</option>
               {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Mulai Tanggal</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full mt-2 p-3 border rounded-xl bg-slate-50" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Sampai Tanggal</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full mt-2 p-3 border rounded-xl bg-slate-50" />
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 h-64 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="p-3 w-16 text-center"><input type="checkbox" onChange={handleSelectAll} checked={selectedEmployees.size === employees.length && employees.length > 0} /></th>
                <th className="p-3 uppercase text-xs font-bold text-slate-500">Nama</th>
                <th className="p-3 uppercase text-xs font-bold text-slate-500">Departemen</th>
                <th className="p-3 uppercase text-xs font-bold text-slate-500">Shift Asli</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr key={emp.id} className="border-t">
                  <td className="p-3 text-center"><input type="checkbox" checked={selectedEmployees.has(emp.id.toString())} onChange={() => handleSelectEmp(emp.id)} /></td>
                  <td className="p-3 font-semibold">{emp.name}</td>
                  <td className="p-3">{emp.department?.name}</td>
                  <td className="p-3 text-slate-500">{emp.shift?.name || 'Default'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
           <span className="text-blue-700 font-bold">{selectedEmployees.size} Karyawan Dipilih</span>
           <button onClick={handleApply} disabled={createOverrideMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50">
             {createOverrideMutation.isPending ? <Loader2 className="animate-spin w-4 h-4"/> : <Save className="w-4 h-4" />} Terapkan Rolling Shift
           </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="font-bold text-slate-800 mb-4">Daftar Rolling Shift Aktif / Riwayat</h3>
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-3 font-bold text-slate-500">Employee</th>
                <th className="p-3 font-bold text-slate-500">Shift Ganti</th>
                <th className="p-3 font-bold text-slate-500">Rentang Tanggal</th>
                <th className="p-3 font-bold text-slate-500">Hapus</th>
              </tr>
            </thead>
            <tbody>
              {overrides.map(ov => (
                <tr key={ov.id} className="border-t">
                  <td className="p-3 font-semibold">{ov.employee?.name}</td>
                  <td className="p-3 text-blue-600 font-bold">{ov.shift?.name}</td>
                  <td className="p-3 text-slate-600">
                     {new Date(ov.startDate).toLocaleDateString()} s/d {new Date(ov.endDate).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    <button onClick={() => deleteOverrideMutation.mutate(ov.id)} className="text-red-500 hover:text-red-700 p-2"><Trash2 className="w-4 h-4"/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>
    </div>
  );
};
export default ShiftRoster;
