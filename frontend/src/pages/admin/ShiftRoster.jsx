import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { employeeAPI, settingsAPI, userAPI } from '../../services/api'; 
import { Calendar, Users, Save, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { scheduleAPI } from '../../services/api';

const ShiftRoster = () => {
  const queryClient = useQueryClient();
  
  // Tab control state
  const [activeTab, setActiveTab] = useState('manual');

  // Tab 1: Manual setup states
  const [selectedEmployees, setSelectedEmployees] = useState(new Set());
  const [targetShift, setTargetShift] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Tab 2: Roster Generator states
  const [autoStartDate, setAutoStartDate] = useState('');
  const [autoEndDate, setAutoEndDate] = useState('');
  const [autoGroups, setAutoGroups] = useState([
    { id: 'group-1', name: 'Regu 1', employeeIds: new Set(), pattern: ["", "", "", "", "", ""] }
  ]);
  const [expandedGroupSelector, setExpandedGroupSelector] = useState(null);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [groupDeptFilter, setGroupDeptFilter] = useState('');

  // History list filter states
  const [historySearch, setHistorySearch] = useState('');
  const [historyDept, setHistoryDept] = useState('');
  
  // Fetch common queries
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
    queryFn: () => scheduleAPI.getOverrides()
  });

  const { data: deptOptionsData } = useQuery({
    queryKey: ['departments-options'],
    queryFn: () => userAPI.getDepartmentOptions()
  });

  // Tab 1: Create Manual Override Mutation
  const createOverrideMutation = useMutation({
    mutationFn: (data) => scheduleAPI.createOverrides(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shift-overrides'] });
      setSelectedEmployees(new Set());
      alert('Shift rolling berhasil disimpan!');
    },
    onError: (err) => alert(err.response?.data?.message || 'Gagal menyimpan rolling')
  });

  // Tab 2: Bulk Generate Roster Mutation
  const bulkGenerateMutation = useMutation({
    mutationFn: (data) => scheduleAPI.bulkGenerateOverrides(data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['shift-overrides'] });
      alert(res.message || 'Roster rolling berhasil di-generate!');
    },
    onError: (err) => alert(err.response?.data?.message || err.message || 'Gagal men-generate roster')
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: (id) => scheduleAPI.deleteOverride(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['shift-overrides'] })
  });

  const employees = employeesData?.data || [];
  const shifts = shiftsData?.data || [];
  const overrides = overridesData?.data || [];
  const departments = deptOptionsData?.data || [];

  // Get unique departments present in the overrides list
  const historyDepartments = useMemo(() => {
    const depts = new Set();
    overrides.forEach(ov => {
      const dName = ov.employee?.department?.name;
      if (dName) depts.add(dName);
    });
    return Array.from(depts);
  }, [overrides]);

  // Filtered overrides list
  const filteredOverrides = useMemo(() => {
    return overrides.filter(ov => {
      const matchDept = !historyDept || ov.employee?.department?.name === historyDept;
      const matchSearch = !historySearch || 
        ov.employee?.name.toLowerCase().includes(historySearch.toLowerCase()) ||
        ov.employee?.employeeCode?.toLowerCase().includes(historySearch.toLowerCase()) ||
        ov.shift?.name.toLowerCase().includes(historySearch.toLowerCase());
      return matchDept && matchSearch;
    });
  }, [overrides, historyDept, historySearch]);

  // Tab 1: Filtered employees list
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchDept = !deptFilter || emp.departmentId?.toString() === deptFilter;
      const matchSearch = !searchQuery ||
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.employeeCode?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDept && matchSearch;
    });
  }, [employees, deptFilter, searchQuery]);

  const handleSelectAll = (e) => {
    const next = new Set(selectedEmployees);
    if (e.target.checked) {
      filteredEmployees.forEach(emp => next.add(emp.id.toString()));
    } else {
      filteredEmployees.forEach(emp => next.delete(emp.id.toString()));
    }
    setSelectedEmployees(next);
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

  // Tab 2: Group roster builder helpers
  const handleAddNewGroup = () => {
    const nextId = `group-${Date.now()}`;
    setAutoGroups(prev => [
      ...prev,
      { id: nextId, name: `Regu ${prev.length + 1}`, employeeIds: new Set(), pattern: ["", "", "", "", "", ""] }
    ]);
  };

  const handleRemoveGroup = (id) => {
    if (autoGroups.length === 1) {
      alert('Minimal harus ada 1 Regu!');
      return;
    }
    setAutoGroups(prev => prev.filter(g => g.id !== id));
    if (expandedGroupSelector === id) setExpandedGroupSelector(null);
  };

  const handleGroupNameChange = (id, newName) => {
    setAutoGroups(prev => prev.map(g => g.id === id ? { ...g, name: newName } : g));
  };

  const handleAddDayToPattern = (id) => {
    setAutoGroups(prev => prev.map(g => {
      if (g.id === id) {
        if (g.pattern.length >= 31) {
          alert('Maksimal panjang pola adalah 31 hari!');
          return g;
        }
        return { ...g, pattern: [...g.pattern, ""] };
      }
      return g;
    }));
  };

  const handleRemoveDayFromPattern = (id) => {
    setAutoGroups(prev => prev.map(g => {
      if (g.id === id) {
        if (g.pattern.length <= 1) return g;
        return { ...g, pattern: g.pattern.slice(0, -1) };
      }
      return g;
    }));
  };

  const handlePatternShiftChange = (groupId, dayIndex, value) => {
    setAutoGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const newPattern = [...g.pattern];
        newPattern[dayIndex] = value === "" ? null : parseInt(value);
        return { ...g, pattern: newPattern };
      }
      return g;
    }));
  };

  const toggleEmployeeSelector = (groupId) => {
    if (expandedGroupSelector === groupId) {
      setExpandedGroupSelector(null);
    } else {
      setExpandedGroupSelector(groupId);
      setGroupSearchQuery('');
      setGroupDeptFilter('');
    }
  };

  const handleToggleEmployeeInGroup = (groupId, empId) => {
    setAutoGroups(prev => prev.map(g => {
      if (g.id === groupId) {
        const newSet = new Set(g.employeeIds);
        if (newSet.has(empId)) {
          newSet.delete(empId);
        } else {
          // Remove from other groups first to maintain exclusivity
          setAutoGroups(otherGroups => otherGroups.map(og => {
            if (og.id !== groupId && og.employeeIds.has(empId)) {
              const cleanedSet = new Set(og.employeeIds);
              cleanedSet.delete(empId);
              return { ...og, employeeIds: cleanedSet };
            }
            return og;
          }));
          newSet.add(empId);
        }
        return { ...g, employeeIds: newSet };
      }
      return g;
    }));
  };

  const findSecurityShifts = () => {
    const shift1 = shifts.find(s => s.name.toLowerCase().includes('secur') && (s.name.includes('1') || s.name.toLowerCase().includes('pagi')))?.id || 6;
    const shift2 = shifts.find(s => s.name.toLowerCase().includes('secur') && (s.name.includes('2') || s.name.toLowerCase().includes('malam')))?.id || 7;
    return { shift1, shift2 };
  };

  const applySecurityPreset = () => {
    const { shift1, shift2 } = findSecurityShifts();
    
    // Set dates to June 2026 as default
    setAutoStartDate(`2026-06-01`);
    setAutoEndDate(`2026-06-30`);

    const matchedRegu1 = new Set();
    const matchedRegu2 = new Set();
    const matchedRegu3 = new Set();

    employees.forEach(emp => {
      const name = emp.name.toLowerCase();
      const id = emp.id;
      if (id === 2844 || name === 'husen' || name.includes('muhamad husen')) matchedRegu1.add(id);
      else if (id === 2854 || name.includes('elan wahyudin')) matchedRegu1.add(id);
      else if (id === 2855 || name.includes('fian robiana')) matchedRegu2.add(id);
      else if (id === 2856 || name.includes('yeyep hardian')) matchedRegu2.add(id);
      else if (id === 3006 || name.includes('zainal arifin')) matchedRegu3.add(id);
      else if (id === 3046 || name.includes('lutfi hidayat')) matchedRegu3.add(id);
    });

    const presetGroups = [
      {
        id: 'regu-1',
        name: 'Regu 1',
        employeeIds: matchedRegu1.size > 0 ? matchedRegu1 : new Set([2844, 2854]),
        pattern: [shift1, shift1, shift2, shift2, null, null]
      },
      {
        id: 'regu-2',
        name: 'Regu 2',
        employeeIds: matchedRegu2.size > 0 ? matchedRegu2 : new Set([2855, 2856]),
        pattern: [shift2, shift2, null, null, shift1, shift1]
      },
      {
        id: 'regu-3',
        name: 'Regu 3',
        employeeIds: matchedRegu3.size > 0 ? matchedRegu3 : new Set([3006, 3046]),
        pattern: [null, null, shift1, shift1, shift2, shift2]
      }
    ];

    setAutoGroups(presetGroups);
    alert('Preset Security berhasil diterapkan untuk Juni 2026! Silakan cek tanggal dan nama karyawan di setiap Regu.');
  };

  const handleGenerateRoster = () => {
    if (!autoStartDate || !autoEndDate) {
      return alert('Harap pilih Tanggal Mulai dan Tanggal Selesai.');
    }

    let hasError = false;
    const formattedGroups = autoGroups.map(g => {
      if (!g.name.trim()) {
        alert('Nama Regu tidak boleh kosong.');
        hasError = true;
      }
      if (g.employeeIds.size === 0) {
        alert(`Regu "${g.name}" belum memiliki anggota karyawan.`);
        hasError = true;
      }
      const hasValidPattern = g.pattern.some(p => p !== null && p !== undefined && p !== "");
      if (!hasValidPattern) {
        alert(`Pola rotasi untuk "${g.name}" harus memiliki minimal 1 hari kerja (bukan OFF semua).`);
        hasError = true;
      }

      return {
        employeeIds: Array.from(g.employeeIds),
        pattern: g.pattern.map(p => (p === "" || p === null) ? null : parseInt(p))
      };
    });

    if (hasError) return;

    if (confirm('Men-generate roster baru akan menimpa override jadwal yang bertabrakan pada rentang tanggal tersebut. Lanjutkan?')) {
      bulkGenerateMutation.mutate({
        startDate: autoStartDate,
        endDate: autoEndDate,
        groups: formattedGroups
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold flex items-center gap-3 mb-4">
          <Calendar className="text-blue-600"/> Setup Rolling Shift & Roster Karyawan
        </h2>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 mb-6">
          <button
            onClick={() => setActiveTab('manual')}
            className={`py-3 px-6 font-bold text-sm border-b-2 transition-all ${
              activeTab === 'manual'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Setup Manual (Satu per Satu)
          </button>
          <button
            onClick={() => setActiveTab('auto')}
            className={`py-3 px-6 font-bold text-sm border-b-2 transition-all ${
              activeTab === 'auto'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Generator Otomatis (Roster Regu)
          </button>
        </div>

        {activeTab === 'manual' ? (
          <div>
            {/* Step 1: Shift & Date Config */}
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

            {/* Step 2: Employee Select header with search and filter */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pt-4 border-t border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600"/> Pilih Karyawan
              </h3>
              <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
                <input
                  type="text"
                  placeholder="Cari Karyawan (Nama / NIK)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 p-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <select
                  value={deptFilter}
                  onChange={(e) => setDeptFilter(e.target.value)}
                  className="w-full sm:w-56 p-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-700"
                >
                  <option value="">Semua Departemen</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id.toString()}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Employee Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden mb-6 h-64 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="p-3 w-16 text-center">
                      <input 
                        type="checkbox" 
                        onChange={handleSelectAll} 
                        checked={filteredEmployees.length > 0 && filteredEmployees.every(emp => selectedEmployees.has(emp.id.toString()))} 
                      />
                    </th>
                    <th className="p-3 uppercase text-xs font-bold text-slate-500">Nama</th>
                    <th className="p-3 uppercase text-xs font-bold text-slate-500">Departemen</th>
                    <th className="p-3 uppercase text-xs font-bold text-slate-500">Shift Asli</th>
                  </tr>
                </thead>
                <tbody>
                  {empLoading ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                          <span>Memuat data karyawan...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        Tidak ada karyawan yang cocok dengan filter.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map(emp => (
                      <tr key={emp.id} className="border-t hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center">
                          <input 
                            type="checkbox" 
                            checked={selectedEmployees.has(emp.id.toString())} 
                            onChange={() => handleSelectEmp(emp.id)} 
                          />
                        </td>
                        <td className="p-3 font-semibold">{emp.name}</td>
                        <td className="p-3">{emp.department?.name}</td>
                        <td className="p-3 text-slate-500">{emp.shift?.name || 'Default'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Selected Summary and Actions */}
            <div className="flex justify-between items-center bg-blue-50 p-4 rounded-xl border border-blue-100">
               <span className="text-blue-700 font-bold">{selectedEmployees.size} Karyawan Dipilih</span>
               <button onClick={handleApply} disabled={createOverrideMutation.isPending} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 disabled:opacity-50">
                 {createOverrideMutation.isPending ? <Loader2 className="animate-spin w-4 h-4"/> : <Save className="w-4 h-4" />} Terapkan Rolling Shift
               </button>
            </div>
          </div>
        ) : (
          <div>
            {/* Tab 2: Generator Otomatis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Mulai Tanggal</label>
                <input type="date" value={autoStartDate} onChange={e => setAutoStartDate(e.target.value)} className="w-full mt-2 p-3 border rounded-xl bg-slate-50" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">Sampai Tanggal</label>
                <input type="date" value={autoEndDate} onChange={e => setAutoEndDate(e.target.value)} className="w-full mt-2 p-3 border rounded-xl bg-slate-50" />
              </div>
            </div>

            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800">Daftar Regu / Kelompok</h3>
              <button
                type="button"
                onClick={applySecurityPreset}
                className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              >
                ⚡ Preset Roster Security (3 Regu)
              </button>
            </div>

            {autoGroups.map((group) => (
              <div key={group.id} className="bg-slate-50 p-5 rounded-2xl border border-slate-200 mb-6 relative">
                <button
                  type="button"
                  onClick={() => handleRemoveGroup(group.id)}
                  className="absolute top-4 right-4 text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-slate-100 transition-colors"
                >
                  <Trash2 className="w-4 h-4"/>
                </button>

                <div className="mb-4">
                  <label className="text-xs font-bold text-slate-500 uppercase">Nama Regu / Grup</label>
                  <input
                    type="text"
                    value={group.name}
                    onChange={(e) => handleGroupNameChange(group.id, e.target.value)}
                    placeholder="Contoh: Regu A, Security Group..."
                    className="w-full mt-1.5 p-2.5 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm font-semibold border-slate-200"
                  />
                </div>

                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Pola Rotasi Hari (Cycle Pattern)</label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleAddDayToPattern(group.id)}
                        className="text-blue-600 hover:text-blue-800 text-xs font-bold"
                      >
                        + Tambah Hari
                      </button>
                      {group.pattern.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDayFromPattern(group.id)}
                          className="text-red-600 hover:text-red-800 text-xs font-bold"
                        >
                          - Hapus Hari
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    {group.pattern.map((dayShiftId, dayIdx) => (
                      <div key={dayIdx} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-1.5 text-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Hari {dayIdx + 1}</span>
                        <select
                          value={dayShiftId || ""}
                          onChange={(e) => handlePatternShiftChange(group.id, dayIdx, e.target.value)}
                          className="p-1.5 border rounded-lg text-xs bg-slate-50 focus:ring-2 focus:ring-blue-500 w-full font-medium"
                        >
                          <option value="">OFF (Libur)</option>
                          {shifts.map(s => (
                            <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Anggota Regu ({group.employeeIds.size} Karyawan)</label>
                    <button
                      type="button"
                      onClick={() => toggleEmployeeSelector(group.id)}
                      className="text-blue-600 hover:text-blue-800 text-xs font-bold"
                    >
                      {expandedGroupSelector === group.id ? "Sembunyikan Daftar" : "Pilih Karyawan"}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-3">
                    {Array.from(group.employeeIds).map(id => {
                      const emp = employees.find(e => e.id.toString() === id.toString());
                      return emp ? (
                        <span key={id} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 text-blue-700 px-2.5 py-1 rounded-full text-xs font-bold">
                          {emp.name} ({emp.employeeCode})
                          <button
                            type="button"
                            onClick={() => handleToggleEmployeeInGroup(group.id, id)}
                            className="text-blue-500 hover:text-blue-700 font-bold ml-1 text-sm focus:outline-none"
                          >
                            &times;
                          </button>
                        </span>
                      ) : null;
                    })}
                    {group.employeeIds.size === 0 && (
                      <span className="text-xs text-slate-400 italic">Belum ada karyawan yang dimasukkan ke regu ini.</span>
                    )}
                  </div>

                  {expandedGroupSelector === group.id && (
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 mt-2 shadow-inner">
                      <div className="flex gap-3 mb-3">
                        <input
                          type="text"
                          placeholder="Cari nama / NIK..."
                          value={groupSearchQuery}
                          onChange={(e) => setGroupSearchQuery(e.target.value)}
                          className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <select
                          value={groupDeptFilter}
                          onChange={(e) => setGroupDeptFilter(e.target.value)}
                          className="p-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                        >
                          <option value="">Semua Departemen</option>
                          {departments.map((dept) => (
                            <option key={dept.id} value={dept.id.toString()}>
                              {dept.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100 text-xs">
                        {employees
                          .filter(emp => {
                            const matchDept = !groupDeptFilter || emp.departmentId?.toString() === groupDeptFilter;
                            const matchSearch = !groupSearchQuery ||
                              emp.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
                              emp.employeeCode?.toLowerCase().includes(groupSearchQuery.toLowerCase());
                            return matchDept && matchSearch;
                          })
                          .map(emp => {
                            const isSelected = group.employeeIds.has(emp.id);
                            const belongsToOtherGroup = autoGroups.some(g => g.id !== group.id && g.employeeIds.has(emp.id));
                            
                            return (
                              <div key={emp.id} className={`p-2 flex items-center justify-between hover:bg-slate-50 ${belongsToOtherGroup ? 'opacity-50' : ''}`}>
                                <label className="flex items-center gap-2 font-medium w-full cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={belongsToOtherGroup}
                                    onChange={() => handleToggleEmployeeInGroup(group.id, emp.id)}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                  />
                                  <div>
                                    <span className="font-bold text-slate-700">{emp.name}</span>
                                    <span className="text-slate-400 ml-1">({emp.employeeCode} - {emp.department?.name})</span>
                                  </div>
                                </label>
                                {belongsToOtherGroup && (
                                  <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200 whitespace-nowrap">
                                    Ada di Regu Lain
                                  </span>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            <div className="flex gap-4 justify-between items-center mt-6 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={handleAddNewGroup}
                className="border border-blue-500 text-blue-600 hover:bg-blue-50 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all shadow-sm bg-white animate-pulse"
              >
                + Tambah Regu Baru
              </button>
              
              <button
                type="button"
                onClick={handleGenerateRoster}
                disabled={bulkGenerateMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm disabled:opacity-50"
              >
                {bulkGenerateMutation.isPending ? <Loader2 className="animate-spin w-4 h-4"/> : <Save className="w-4 h-4" />} Generate & Simpan Roster
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Roster History List */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <h3 className="font-bold text-slate-800">Daftar Rolling Shift Aktif / Riwayat</h3>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <input
              type="text"
              placeholder="Cari Karyawan / Shift..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="w-full sm:w-60 p-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-slate-700"
            />
            <select
              value={historyDept}
              onChange={(e) => setHistoryDept(e.target.value)}
              className="w-full sm:w-48 p-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-700 font-medium"
            >
              <option value="">Semua Departemen</option>
              {historyDepartments.map((deptName) => (
                <option key={deptName} value={deptName}>
                  {deptName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
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
              {overridesLoading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                      <span>Memuat riwayat rolling shift...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredOverrides.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-slate-500">
                    Tidak ada data rolling shift yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredOverrides.map(ov => (
                  <tr key={ov.id} className="border-t hover:bg-slate-50 transition-colors">
                    <td className="p-3 font-semibold">
                      <div>{ov.employee?.name}</div>
                      <div className="text-[10px] text-slate-400 font-medium">{ov.employee?.department?.name || 'No Dept'}</div>
                    </td>
                    <td className="p-3 text-blue-600 font-bold">{ov.shift?.name}</td>
                    <td className="p-3 text-slate-600">
                       {new Date(ov.startDate).toLocaleDateString()} s/d {new Date(ov.endDate).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <button 
                        onClick={() => deleteOverrideMutation.mutate(ov.id)} 
                        disabled={deleteOverrideMutation.isPending}
                        className="text-red-500 hover:text-red-700 p-2 disabled:opacity-50"
                      >
                        <Trash2 className="w-4 h-4"/>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default ShiftRoster;
