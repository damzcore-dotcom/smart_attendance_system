import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { employeeAPI } from '../../services/api';
import { 
  FileText, Search, Filter, ShieldCheck, ChevronRight, Loader2, Calendar, AlertCircle, Clock, Users, ArrowUpRight, Fingerprint
} from 'lucide-react';

const EmployeeContracts = ({ isReadOnly = false }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '', 'expired', 'critical', 'active'
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  // Load all employees with biometrics/contracts info
  const { data: allEmployeesData, isLoading } = useQuery({
    queryKey: ['all-employees-biometrics'],
    queryFn: () => employeeAPI.getAll({ limit: 10000, excludeBhl: true })
  });
  const allEmployees = allEmployeesData?.data || [];

  // Load master options for department filter
  const { data: optionsData } = useQuery({
    queryKey: ['master-options'],
    queryFn: () => employeeAPI.getMasterOptions()
  });
  const departments = optionsData?.data?.departments || [];

  // Filter only contract employees (KONTRAK or PKWT)
  const contractEmployees = allEmployees.filter(e => {
    const status = e.employmentStatus?.toUpperCase();
    return status === 'KONTRAK' || status === 'PKWT' || status === 'KARYAWAN KONTRAK';
  });

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Compute days left and alert level for each contract
  const employeesWithContractInfo = contractEmployees.map(emp => {
    let daysLeft = null;
    let alertLevel = 'normal'; // normal, expired, critical, warning, attention

    if (emp.contractEnd) {
      const end = new Date(emp.contractEnd);
      end.setHours(0, 0, 0, 0);
      daysLeft = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      
      if (daysLeft <= 0) alertLevel = 'expired';
      else if (daysLeft <= 7) alertLevel = 'critical';
      else if (daysLeft <= 14) alertLevel = 'warning';
      else if (daysLeft <= 30) alertLevel = 'attention';
    }

    return {
      ...emp,
      daysLeft,
      alertLevel
    };
  });

  // Calculate statistics
  const totalContracts = employeesWithContractInfo.length;
  const expiredCount = employeesWithContractInfo.filter(e => e.daysLeft !== null && e.daysLeft <= 0).length;
  const criticalCount = employeesWithContractInfo.filter(e => e.daysLeft !== null && e.daysLeft > 0 && e.daysLeft <= 30).length;
  const activeCount = totalContracts - expiredCount - criticalCount;

  // Filter logic
  const filtered = employeesWithContractInfo.filter(emp => {
    const matchesSearch = emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.employeeCode?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = !deptFilter || emp.dept === deptFilter;
    
    let matchesStatus = true;
    if (statusFilter === 'expired') {
      matchesStatus = emp.daysLeft !== null && emp.daysLeft <= 0;
    } else if (statusFilter === 'critical') {
      matchesStatus = emp.daysLeft !== null && emp.daysLeft > 0 && emp.daysLeft <= 30;
    } else if (statusFilter === 'active') {
      matchesStatus = emp.daysLeft !== null && emp.daysLeft > 30;
    }

    return matchesSearch && matchesDept && matchesStatus;
  });

  // Pagination calculations
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  const startIndex = (page - 1) * PAGE_SIZE;
  const paginatedEmployees = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const handleNavigateToEdit = (employeeCode) => {
    // Navigate to Employees page with state to auto-trigger the edit modal
    navigate('/admin/employees', { state: { editEmployeeCode: employeeCode } });
  };

  const getAlertBadgeStyles = (level) => {
    switch (level) {
      case 'expired':
        return 'bg-rose-50 border-rose-200 text-rose-600';
      case 'critical':
        return 'bg-rose-50/50 border-rose-100 text-rose-500 animate-pulse';
      case 'warning':
      case 'attention':
        return 'bg-amber-50 border-amber-200 text-amber-600';
      default:
        return 'bg-emerald-50 border-emerald-200 text-emerald-600';
    }
  };

  const getAlertStatusLabel = (level, daysLeft) => {
    if (level === 'expired') return 'Kadaluarsa';
    if (daysLeft !== null) {
      if (daysLeft <= 7) return `Sangat Kritis (${daysLeft} Hari)`;
      if (daysLeft <= 30) return `Mendekati Akhir (${daysLeft} Hari)`;
      return `Aktif (${daysLeft} Hari)`;
    }
    return 'Aktif';
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="print:hidden space-y-8">
        
        {/* 1. Page Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 px-1">
          <div className="space-y-1">
            <div className="flex items-center gap-3 text-slate-500">
              <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
                <ShieldCheck className="w-3 h-3 text-slate-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Pengawasan Administratif</span>
              <div className="w-1 h-1 rounded-full bg-slate-300" />
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Kontrak Kerja (PKWT)</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
              Manajemen Kontrak Kerja
              <div className="px-3 py-1 rounded-lg bg-orange-50 border border-orange-100 text-orange-600 text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                Sistem Pemantauan PKWT
              </div>
            </h1>
          </div>
          
          {!isReadOnly && (
            <button 
              onClick={() => navigate('/admin/employees')}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 group"
            >
              Kembali ke Data Karyawan
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

        {/* 2. Stats Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 px-1">
          {/* Card 1: Total Kontrak */}
          <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between hover:border-blue-300 transition-all group">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Karyawan Kontrak</span>
              <div className="text-2xl font-bold text-slate-800 tracking-tight">
                {totalContracts} <span className="text-xs text-slate-500 font-medium">orang</span>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                Status Kerja PKWT / Kontrak
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
              <Users className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Kontrak Aktif */}
          <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between hover:border-emerald-300 transition-all group">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kontrak Aktif Aman</span>
              <div className="text-2xl font-bold text-emerald-600 tracking-tight">
                {activeCount} <span className="text-xs text-slate-500 font-medium">orang</span>
              </div>
              <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider">
                Masa Berlaku &gt; 30 Hari
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          {/* Card 3: Hampir Habis */}
          <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between hover:border-orange-300 transition-all group">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Segera Berakhir</span>
              <div className="text-2xl font-bold text-orange-600 tracking-tight">
                {criticalCount} <span className="text-xs text-slate-500 font-medium">orang</span>
              </div>
              <p className="text-[10px] text-orange-500 font-semibold uppercase tracking-wider">
                Jatuh Tempo &lt;= 30 Hari
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center border border-orange-100 group-hover:bg-orange-600 group-hover:text-white transition-all shadow-sm">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Card 4: Expired */}
          <div className="bg-white p-5 border border-slate-200 rounded-2xl shadow-sm flex items-center justify-between hover:border-rose-300 transition-all group">
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Kontrak Habis</span>
              <div className="text-2xl font-bold text-rose-600 tracking-tight">
                {expiredCount} <span className="text-xs text-slate-500 font-medium">orang</span>
              </div>
              <p className="text-[10px] text-rose-500 font-semibold uppercase tracking-wider">
                Harus Segera Diperbarui
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100 group-hover:bg-rose-600 group-hover:text-white transition-all shadow-sm">
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 3. Filters */}
        <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Cari Karyawan</label>
              <div className="relative group">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Nama atau NIK..." 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all placeholder:text-slate-400"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Departemen</label>
              <div className="relative">
                <select 
                  value={deptFilter} 
                  onChange={e => { setDeptFilter(e.target.value); setPage(1); }} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
                >
                  <option value="">Semua Departemen</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Filter className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Status Kontrak</label>
              <div className="relative">
                <select 
                  value={statusFilter} 
                  onChange={e => { setStatusFilter(e.target.value); setPage(1); }} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
                >
                  <option value="">Semua Status</option>
                  <option value="active">Kontrak Aktif (&gt; 30 Hari)</option>
                  <option value="critical">Segera Berakhir (&lt;= 30 Hari)</option>
                  <option value="expired">Kadaluarsa (Habis Kontrak)</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Filter className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Contracts Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-auto min-h-[300px]">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {!isReadOnly && <th className="px-6 py-4 w-28 text-center">Aksi</th>}
                  <th className="px-6 py-4">NIK</th>
                  <th className="px-6 py-4">Nama Karyawan</th>
                  <th className="px-6 py-4">Departemen</th>
                  <th className="px-6 py-4">Jabatan</th>
                  <th className="px-6 py-4">Durasi Kontrak</th>
                  <th className="px-6 py-4 text-center">Mulai Kontrak</th>
                  <th className="px-6 py-4 text-center">Akhir Kontrak</th>
                  <th className="px-6 py-4 text-center">Sisa Hari</th>
                  <th className="px-6 py-4">Status Kontrak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan="10" className="text-center py-24">
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Memuat Data Kontrak...</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="text-center py-20 text-slate-400 font-medium">
                      Tidak ada data kontrak yang sesuai dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map((emp) => (
                    <tr key={emp.dbId} className="hover:bg-slate-50/50 transition-colors duration-200">
                      {!isReadOnly && (
                        <td className="px-6 py-3 text-center">
                          <button 
                            onClick={() => handleNavigateToEdit(emp.employeeCode)} 
                            className="px-3.5 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-100 hover:border-blue-600 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 mx-auto cursor-pointer"
                          >
                            Ubah Kontrak
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                      <td className="px-6 py-3 font-semibold text-xs text-slate-700">
                        {!isReadOnly ? (
                          <span 
                            onClick={() => handleNavigateToEdit(emp.employeeCode)}
                            className="hover:text-blue-600 hover:underline cursor-pointer"
                          >
                            {emp.employeeCode}
                          </span>
                        ) : (
                          <span>{emp.employeeCode}</span>
                        )}
                      </td>
                      <td className="px-6 py-3 font-bold text-slate-800">
                        {!isReadOnly ? (
                          <span 
                            onClick={() => handleNavigateToEdit(emp.employeeCode)}
                            className="hover:text-blue-600 hover:underline cursor-pointer"
                          >
                            {emp.name}
                          </span>
                        ) : (
                          <span>{emp.name}</span>
                        )}
                        <div className="text-[10px] text-slate-400 font-medium normal-case">{emp.email || 'Tidak Ada Email'}</div>
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-600">{emp.dept || '-'}</td>
                      <td className="px-6 py-3 text-xs text-slate-600">{emp.position || '-'}</td>
                      <td className="px-6 py-3 text-xs text-slate-600">{emp.contractDuration || '-'}</td>
                      <td className="px-6 py-3 text-xs text-slate-600 text-center font-medium font-mono">
                        {emp.joinDate ? new Date(emp.joinDate).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-600 text-center font-medium font-mono">
                        {emp.contractEnd ? new Date(emp.contractEnd).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] ${emp.daysLeft <= 0 ? 'text-rose-600 bg-rose-50' : emp.daysLeft <= 30 ? 'text-amber-600 bg-amber-50' : 'text-slate-600 bg-slate-50'}`}>
                          {emp.daysLeft !== null ? (emp.daysLeft <= 0 ? `Habis` : `${emp.daysLeft} Hari`) : '-'}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md border ${getAlertBadgeStyles(emp.alertLevel)}`}>
                          <Clock className="w-3 h-3" />
                          {getAlertStatusLabel(emp.alertLevel, emp.daysLeft)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium">
              Menampilkan <span className="font-bold text-slate-800">{paginatedEmployees.length}</span> dari <span className="font-bold text-slate-800">{totalItems}</span> data | Halaman <span className="font-bold text-slate-800">{page}</span> dari <span className="font-bold text-slate-800">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default EmployeeContracts;
