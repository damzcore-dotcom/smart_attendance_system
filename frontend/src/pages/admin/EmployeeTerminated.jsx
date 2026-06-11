import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { employeeAPI } from '../../services/api';
import { 
  UserMinus, Search, Filter, ChevronRight, Loader2, Calendar, AlertCircle, Clock, Users, ArrowUpRight, RotateCcw, AlertTriangle
} from 'lucide-react';

const EmployeeTerminated = ({ isReadOnly = false }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [page, setPage] = useState(1);
  const [rehireConfirmEmp, setRehireConfirmEmp] = useState(null);
  const PAGE_SIZE = 25;

  // Load all employees
  const { data: allEmployeesData, isLoading } = useQuery({
    queryKey: ['all-employees-terminated'],
    queryFn: () => employeeAPI.getAll({ limit: 10000, excludeBhl: true })
  });
  const allEmployees = allEmployeesData?.data || [];

  // Load master options for department filter
  const { data: optionsData } = useQuery({
    queryKey: ['master-options'],
    queryFn: () => employeeAPI.getMasterOptions()
  });
  const departments = optionsData?.data?.departments || [];

  // Filter only terminated employees
  const terminatedEmployees = allEmployees.filter(e => {
    return e.status === 'Terminated' || e.status === 'TERMINATED';
  });

  // Re-hire mutation
  const rehireMutation = useMutation({
    mutationFn: ({ id, data }) => employeeAPI.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-employees-terminated'] });
      queryClient.invalidateQueries({ queryKey: ['all-employees-biometrics'] });
      setRehireConfirmEmp(null);
      alert(t('terminatedPage.rehireSuccess'));
    },
    onError: (err) => {
      alert(err.message || t('terminatedPage.rehireError'));
    }
  });

  const handleRehire = (emp) => {
    rehireMutation.mutate({
      id: emp.dbId,
      data: {
        status: 'ACTIVE',
        terminationDate: null,
        terminationReason: null
      }
    });
  };

  // Calculate statistics
  const totalOut = terminatedEmployees.length;
  const resignCount = terminatedEmployees.filter(e => (e.terminationReason || '').toLowerCase().includes('resign') || (e.terminationReason || '').toLowerCase().includes('diri')).length;
  const phkCount = terminatedEmployees.filter(e => (e.terminationReason || '').toLowerCase().includes('phk') || (e.terminationReason || '').toLowerCase().includes('putus')).length;
  const othersCount = totalOut - resignCount - phkCount;

  // Filter logic
  const filtered = terminatedEmployees.filter(emp => {
    const matchesSearch = emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.employeeCode?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = !deptFilter || emp.dept === deptFilter;
    
    let matchesReason = true;
    if (reasonFilter === 'resign') {
      matchesReason = (emp.terminationReason || '').toLowerCase().includes('resign') || (emp.terminationReason || '').toLowerCase().includes('diri');
    } else if (reasonFilter === 'phk') {
      matchesReason = (emp.terminationReason || '').toLowerCase().includes('phk') || (emp.terminationReason || '').toLowerCase().includes('putus');
    } else if (reasonFilter === 'others') {
      const isResign = (emp.terminationReason || '').toLowerCase().includes('resign') || (emp.terminationReason || '').toLowerCase().includes('diri');
      const isPhk = (emp.terminationReason || '').toLowerCase().includes('phk') || (emp.terminationReason || '').toLowerCase().includes('putus');
      matchesReason = !isResign && !isPhk;
    }

    return matchesSearch && matchesDept && matchesReason;
  });

  // Pagination calculations
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
  const startIndex = (page - 1) * PAGE_SIZE;
  const paginatedEmployees = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  const handleNavigateToEdit = (employeeCode) => {
    navigate('/admin/employees', { state: { editEmployeeCode: employeeCode } });
  };

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="print:hidden space-y-8">
        
        {/* 1. Page Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 px-1">
          <div className="space-y-1">
            <div className="flex items-center gap-3 text-slate-500">
              <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
                <UserMinus className="w-3 h-3 text-slate-400" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">{t('employees.adminOversight')}</span>
              <div className="w-1 h-1 rounded-full bg-slate-300" />
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">{t('terminatedPage.subtitle')}</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
              {t('terminatedPage.title')}
              <div className="px-3 py-1 rounded-lg bg-rose-50 border border-rose-100 text-rose-600 text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                {t('terminatedPage.monitoringSystem')}
              </div>
            </h1>
          </div>
          
          {!isReadOnly && (
            <button 
              onClick={() => navigate('/admin/employees')}
              className="flex items-center gap-2 bg-white hover:bg-slate-50 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-800 transition-all border border-slate-200 shadow-sm active:scale-95 group"
            >
              {t('terminatedPage.backToEmployees')}
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
            </button>
          )}
        </div>

        {/* 2. Stats Dashboard */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 px-1">
          {/* Card 1: Total Out */}
          <div 
            onClick={() => { setReasonFilter(''); setPage(1); }}
            className={`p-5 border rounded-2xl shadow-sm flex items-center justify-between transition-all group cursor-pointer active:scale-[0.98] ${
              reasonFilter === '' 
                ? 'border-rose-500 bg-rose-50/20 ring-2 ring-rose-500/20' 
                : 'bg-white border-slate-200 hover:border-rose-350'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('terminatedPage.totalTerminated')}</span>
              <div className="text-2xl font-bold text-slate-800 tracking-tight">
                {totalOut} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                {t('terminatedPage.descTotal')}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all shadow-sm ${
              reasonFilter === ''
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-rose-50 text-rose-600 border-rose-100 group-hover:bg-rose-600 group-hover:text-white'
            }`}>
              <Users className="w-5 h-5" />
            </div>
          </div>

          {/* Card 2: Resigned */}
          <div 
            onClick={() => { setReasonFilter(reasonFilter === 'resign' ? '' : 'resign'); setPage(1); }}
            className={`p-5 border rounded-2xl shadow-sm flex items-center justify-between transition-all group cursor-pointer active:scale-[0.98] ${
              reasonFilter === 'resign' 
                ? 'border-amber-500 bg-amber-50/20 ring-2 ring-amber-500/20' 
                : 'bg-white border-slate-200 hover:border-amber-300'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('terminatedPage.resignedCount')}</span>
              <div className="text-2xl font-bold text-amber-600 tracking-tight">
                {resignCount} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
              </div>
              <p className="text-[10px] text-amber-500 font-semibold uppercase tracking-wider">
                {t('terminatedPage.descResign')}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all shadow-sm ${
              reasonFilter === 'resign'
                ? 'bg-amber-650 text-white border-amber-600'
                : 'bg-amber-50 text-amber-650 border-amber-105 group-hover:bg-amber-600 group-hover:text-white'
            }`}>
              <UserMinus className="w-5 h-5" />
            </div>
          </div>

          {/* Card 3: PHK */}
          <div 
            onClick={() => { setReasonFilter(reasonFilter === 'phk' ? '' : 'phk'); setPage(1); }}
            className={`p-5 border rounded-2xl shadow-sm flex items-center justify-between transition-all group cursor-pointer active:scale-[0.98] ${
              reasonFilter === 'phk' 
                ? 'border-rose-500 bg-rose-50/20 ring-2 ring-rose-500/20' 
                : 'bg-white border-slate-200 hover:border-rose-300'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('terminatedPage.firedCount')}</span>
              <div className="text-2xl font-bold text-rose-600 tracking-tight">
                {phkCount} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
              </div>
              <p className="text-[10px] text-rose-500 font-semibold uppercase tracking-wider">
                {t('terminatedPage.descFired')}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all shadow-sm ${
              reasonFilter === 'phk'
                ? 'bg-rose-650 text-white border-rose-600'
                : 'bg-rose-50 text-rose-655 border-rose-105 group-hover:bg-rose-600 group-hover:text-white'
            }`}>
              <AlertCircle className="w-5 h-5" />
            </div>
          </div>

          {/* Card 4: Selesai Kontrak/Training */}
          <div 
            onClick={() => { setReasonFilter(reasonFilter === 'others' ? '' : 'others'); setPage(1); }}
            className={`p-5 border rounded-2xl shadow-sm flex items-center justify-between transition-all group cursor-pointer active:scale-[0.98] ${
              reasonFilter === 'others' 
                ? 'border-slate-500 bg-slate-50/20 ring-2 ring-slate-500/20' 
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('terminatedPage.othersCount')}</span>
              <div className="text-2xl font-bold text-slate-600 tracking-tight">
                {othersCount} <span className="text-xs text-slate-500 font-medium">{t('employees.stats.people')}</span>
              </div>
              <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                {t('terminatedPage.descOthers')}
              </p>
            </div>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center border transition-all shadow-sm ${
              reasonFilter === 'others'
                ? 'bg-slate-600 text-white border-slate-600'
                : 'bg-slate-50 text-slate-650 border-slate-105 group-hover:bg-slate-600 group-hover:text-white'
            }`}>
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 3. Filters */}
        <div className="bg-white p-6 border border-slate-200 rounded-2xl shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('employees.filters.search')}</label>
              <div className="relative group">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-rose-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder={t('terminatedPage.searchPlaceholder')} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 transition-all placeholder:text-slate-400"
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
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 cursor-pointer appearance-none transition-all"
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
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider ml-1">{t('terminatedPage.reasonCategory')}</label>
              <div className="relative">
                <select 
                  value={reasonFilter} 
                  onChange={e => { setReasonFilter(e.target.value); setPage(1); }} 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 cursor-pointer appearance-none transition-all"
                >
                  <option value="">{t('terminatedPage.allCategories')}</option>
                  <option value="resign">{t('terminatedPage.catResign')}</option>
                  <option value="phk">{t('terminatedPage.catFired')}</option>
                  <option value="others">{t('terminatedPage.catOthers')}</option>
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Filter className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Terminated Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-auto min-h-[300px]">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  {!isReadOnly && <th className="px-6 py-4 w-44 text-center">{t('employees.table.actions')}</th>}
                  <th className="px-6 py-4">{t('employees.table.nik')}</th>
                  <th className="px-6 py-4">{t('employees.table.name')}</th>
                  <th className="px-6 py-4">{t('employees.filters.department')}</th>
                  <th className="px-6 py-4">{t('employees.filters.position')}</th>
                  <th className="px-6 py-4 text-center">{t('employees.table.joinDate')}</th>
                  <th className="px-6 py-4 text-center">{t('employees.table.terminationDate')}</th>
                  <th className="px-6 py-4">{t('employees.table.terminationReason')}</th>
                  <th className="px-6 py-4">{t('employees.table.notes')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan="9" className="text-center py-24">
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-8 h-8 animate-spin text-rose-600" />
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{t('common.loading')}</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-20 text-slate-400 font-medium">
                      {t('terminatedPage.noData')}
                    </td>
                  </tr>
                ) : (
                  paginatedEmployees.map((emp) => (
                    <tr key={emp.dbId} className="hover:bg-slate-50/50 transition-colors duration-200">
                      {!isReadOnly && (
                        <td className="px-6 py-3 text-center">
                          <div className="flex items-center gap-2 justify-center">
                            <button 
                              onClick={() => handleNavigateToEdit(emp.employeeCode)} 
                              className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white border border-blue-100 hover:border-blue-600 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
                            >
                              {t('terminatedPage.editInfo')}
                            </button>
                            <button 
                              onClick={() => setRehireConfirmEmp(emp)}
                              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white border border-emerald-100 hover:border-emerald-600 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition-all shadow-sm flex items-center gap-1 cursor-pointer"
                            >
                              <RotateCcw className="w-3 h-3" />
                              {t('terminatedPage.rehire')}
                            </button>
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-3 font-semibold text-xs text-slate-700">
                        {!isReadOnly ? (
                          <span 
                            onClick={() => handleNavigateToEdit(emp.employeeCode)}
                            className="hover:text-rose-600 hover:underline cursor-pointer"
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
                            className="hover:text-rose-600 hover:underline cursor-pointer"
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
                      <td className="px-6 py-3 text-xs text-slate-600 text-center font-medium font-mono">
                        {emp.joinDate ? new Date(emp.joinDate).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                      </td>
                      <td className="px-6 py-3 text-xs text-rose-650 text-center font-bold font-mono">
                        {emp.terminationDate ? new Date(emp.terminationDate).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                      </td>
                      <td className="px-6 py-3 text-xs font-semibold text-slate-700">
                        <span className="px-2.5 py-0.5 rounded font-bold text-[10px] text-rose-600 bg-rose-50 border border-rose-100">
                          {emp.terminationReason || t('terminatedPage.notSpecified')}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-xs text-slate-500 max-w-xs truncate">{emp.notes || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
            <p className="text-xs text-slate-500 font-medium" dangerouslySetInnerHTML={{ __html: t('employees.table.showing', { count: totalItems, page, total: totalPages }) }} />
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

      {/* Confirmation Modal for Re-hire */}
      {rehireConfirmEmp && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100 animate-in zoom-in-95 duration-300">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-800">{t('terminatedPage.rehireModalTitle')}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {t('terminatedPage.rehireConfirmText', { name: rehireConfirmEmp.name, nik: rehireConfirmEmp.employeeCode })}
                </p>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {t('terminatedPage.rehireWarningText')}
                </p>
              </div>
            </div>
            
            <div className="flex items-center justify-end gap-3 mt-6">
              <button 
                onClick={() => setRehireConfirmEmp(null)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button 
                onClick={() => handleRehire(rehireConfirmEmp)}
                disabled={rehireMutation.isPending}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {rehireMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {t('terminatedPage.actionRehire')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeTerminated;
