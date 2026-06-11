import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { employeeAPI } from '../../services/api';
import { 
  FileText, Search, Filter, ShieldCheck, ChevronRight, Loader2, Calendar, AlertCircle, Clock, Users, ArrowUpRight, Fingerprint
} from 'lucide-react';

const EmployeeContracts = ({ isReadOnly = false }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => {
    return location.state?.filter || '';
  });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    if (location.state?.filter) {
      // Clear state so reload/re-nav doesn't freeze the filter
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, navigate]);

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

  // Filter only contract employees (KONTRAK or PKWT) who are not terminated
  const contractEmployees = allEmployees.filter(e => {
    const empStatus = (e.employmentStatus || '').toUpperCase();
    const isContract = empStatus.includes('KONTRAK') || empStatus.includes('PKWT');
    const isTerminated = e.status === 'Terminated' || e.status === 'TERMINATED';
    return isContract && !isTerminated;
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
    navigate('/admin/employees', { state: { editEmployeeCode: employeeCode, cameFrom: '/admin/contracts' } });
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
    if (level === 'expired') return t('contracts.statusExpired');
    if (daysLeft !== null) {
      if (daysLeft <= 7) return `${t('contracts.statusCritical')} (${daysLeft} ${t('contracts.days')})`;
      if (daysLeft <= 30) return `${t('contracts.statusApproachingEnd')} (${daysLeft} ${t('contracts.days')})`;
      return `${t('contracts.statusActive')} (${daysLeft} ${t('contracts.days')})`;
    }
    return t('contracts.statusActive');
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
              <span className="text-[10px] font-bold uppercase tracking-wider">{t('employees.adminOversight')}</span>
              <div className="w-1 h-1 rounded-full bg-slate-300" />
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{t('contracts.subtitle')}</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
              {t('contracts.title')}
              <div className="px-3 py-1 rounded-lg bg-orange-50 border border-orange-100 text-orange-600 text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                {t('contracts.monitoringSystem')}
              </div>
            </h1>
          </div>
          
          {!isReadOnly && (
            <button 
              onClick={() => navigate('/admin/employees')}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 group"
            >
              {t('contracts.backToEmployees')}
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

        {/* 2. Stats Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 px-1">
          {/* Card 1: Total Kontrak */}
          <div 
            onClick={() => { setStatusFilter(''); setPage(1); }}
            className={`p-5 border rounded-2xl shadow-sm flex items-center justify-between transition-all group cursor-pointer active:scale-[0.98] ${
              statusFilter === '' 
                ? 'border-blue-500 bg-blue-50/20 ring-2 ring-blue-500/20' 
                : 'bg-white border-slate-200 hover:border-blue-300'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('contracts.totalContractEmployees')}</span>
              <div className="text-2xl font-bold text-slate-800 tracking-tight">
                {totalContracts} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                {t('contracts.pkwtStatus')}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all shadow-sm ${
              statusFilter === ''
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-blue-50 text-blue-600 border-blue-100 group-hover:bg-blue-600 group-hover:text-white'
            }`}>
              <Users className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Kontrak Aktif */}
          <div 
            onClick={() => { setStatusFilter(statusFilter === 'active' ? '' : 'active'); setPage(1); }}
            className={`p-5 border rounded-2xl shadow-sm flex items-center justify-between transition-all group cursor-pointer active:scale-[0.98] ${
              statusFilter === 'active' 
                ? 'border-emerald-500 bg-emerald-50/20 ring-2 ring-emerald-500/20' 
                : 'bg-white border-slate-200 hover:border-emerald-300'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('contracts.activeSecure')}</span>
              <div className="text-2xl font-bold text-emerald-600 tracking-tight">
                {activeCount} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
              </div>
              <p className="text-[10px] text-emerald-500 font-semibold uppercase tracking-wider">
                {t('contracts.expiresMore30Days')}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all shadow-sm ${
              statusFilter === 'active'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-emerald-50 text-emerald-650 border-emerald-105 group-hover:bg-emerald-600 group-hover:text-white'
            }`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          {/* Card 3: Hampir Habis */}
          <div 
            onClick={() => { setStatusFilter(statusFilter === 'critical' ? '' : 'critical'); setPage(1); }}
            className={`p-5 border rounded-2xl shadow-sm flex items-center justify-between transition-all group cursor-pointer active:scale-[0.98] ${
              statusFilter === 'critical' 
                ? 'border-orange-500 bg-orange-50/20 ring-2 ring-orange-500/20' 
                : 'bg-white border-slate-200 hover:border-orange-300'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('contracts.expiringSoon')}</span>
              <div className="text-2xl font-bold text-orange-600 tracking-tight">
                {criticalCount} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
              </div>
              <p className="text-[10px] text-orange-500 font-semibold uppercase tracking-wider">
                {t('contracts.expires30Days')}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all shadow-sm ${
              statusFilter === 'critical'
                ? 'bg-orange-600 text-white border-orange-600'
                : 'bg-orange-50 text-orange-650 border-orange-105 group-hover:bg-orange-600 group-hover:text-white'
            }`}>
              <Clock className="w-5 h-5" />
            </div>
          </div>

          {/* Card 4: Expired */}
          <div 
            onClick={() => { setStatusFilter(statusFilter === 'expired' ? '' : 'expired'); setPage(1); }}
            className={`p-5 border rounded-2xl shadow-sm flex items-center justify-between transition-all group cursor-pointer active:scale-[0.98] ${
              statusFilter === 'expired' 
                ? 'border-rose-500 bg-rose-50/20 ring-2 ring-rose-500/20' 
                : 'bg-white border-slate-200 hover:border-rose-300'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('contracts.expired')}</span>
              <div className="text-2xl font-bold text-rose-600 tracking-tight">
                {expiredCount} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
              </div>
              <p className="text-[10px] text-rose-500 font-semibold uppercase tracking-wider">
                {t('contracts.mustRenew')}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all shadow-sm ${
              statusFilter === 'expired'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-rose-50 text-rose-650 border-rose-105 group-hover:bg-rose-600 group-hover:text-white'
            }`}>
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 3. Filters */}
        <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('employees.filters.search')}</label>
              <div className="relative group">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder={t('contracts.searchPlaceholder')} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all placeholder:text-slate-400"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('employees.filters.department')}</label>
              <div className="relative">
                <select 
                  value={deptFilter} 
                  onChange={e => { setDeptFilter(e.target.value); setPage(1); }} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
                >
                  <option value="">{t('employees.filters.allDepts')}</option>
                  {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Filter className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('contracts.alertStatus')}</label>
              <div className="relative">
                <select 
                  value={statusFilter} 
                  onChange={e => { setStatusFilter(e.target.value); setPage(1); }} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 cursor-pointer appearance-none transition-all"
                >
                  <option value="">{t('employees.filters.allStatus')}</option>
                  <option value="active">{t('contracts.statusActive')} (&gt; 30 {t('contracts.days')})</option>
                  <option value="critical">{t('contracts.expiringSoon')} (&lt;= 30 {t('contracts.days')})</option>
                  <option value="expired">{t('contracts.statusExpired')}</option>
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
                  {!isReadOnly && <th className="px-6 py-4 w-28 text-center">{t('employees.table.actions')}</th>}
                  <th className="px-6 py-4">{t('employees.table.nik')}</th>
                  <th className="px-6 py-4">{t('employees.table.name')}</th>
                  <th className="px-6 py-4">{t('employees.filters.department')}</th>
                  <th className="px-6 py-4">{t('employees.filters.position')}</th>
                  <th className="px-6 py-4">{t('contracts.contractDuration')}</th>
                  <th className="px-6 py-4 text-center">{t('contracts.startContract')}</th>
                  <th className="px-6 py-4 text-center">{t('contracts.endContract')}</th>
                  <th className="px-6 py-4 text-center">{t('contracts.daysLeft')}</th>
                  <th className="px-6 py-4">{t('contracts.alertStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan="10" className="text-center py-24">
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{t('common.loading')}</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="text-center py-20 text-slate-400 font-medium">
                      {t('announcements.noAnnouncements')}
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
                            {t('contracts.editContractBtn')}
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
                        <div className="text-[10px] text-slate-400 font-medium normal-case">{emp.email || 'No Email'}</div>
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
                          {emp.daysLeft !== null ? (emp.daysLeft <= 0 ? t('contracts.statusExpired') : `${emp.daysLeft} ${t('contracts.days')}`) : '-'}
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
              {t('contracts.showing')} <span className="font-bold text-slate-800">{paginatedEmployees.length}</span> {t('contracts.of')} <span className="font-bold text-slate-800">{totalItems}</span> {t('contracts.data')} | {t('contracts.page')} <span className="font-bold text-slate-800">{page}</span> {t('contracts.of')} <span className="font-bold text-slate-800">{totalPages}</span>
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
