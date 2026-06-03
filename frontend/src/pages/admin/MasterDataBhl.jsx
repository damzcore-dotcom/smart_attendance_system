import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  UserPlus, Search, Edit2, Trash2, X, AlertCircle, Loader2,
  FileSpreadsheet, Upload, Download, HardHat, ShieldCheck, BadgeDollarSign 
} from 'lucide-react';
import api, { employeeAPI, settingsAPI, payrollAPI } from '../../services/api';
import * as XLSX from 'xlsx';

export default function MasterDataBhl() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [isImporting, setIsImporting] = useState(false);
  const PAGE_SIZE = 20;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newBhl, setNewBhl] = useState({
    name: '', employeeCode: '', dept: '', section: '', position: '', 
    idNumber: '', phone: '', joinDate: '', dailyWage: '', shiftId: '', status: 'ACTIVE'
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsAPI.getAll,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['bhl_employees', { search: searchTerm, page, status: statusFilter }],
    queryFn: () => employeeAPI.getAll({ 
      search: searchTerm, 
      page, 
      limit: PAGE_SIZE, 
      onlyBhl: true, 
      status: statusFilter === 'All' ? 'All' : statusFilter 
    }),
    keepPreviousData: true,
  });

  // Query to fetch all BHLs for stats computation
  const { data: allBhlData } = useQuery({
    queryKey: ['bhl_employees_all'],
    queryFn: () => employeeAPI.getAll({ limit: 5000, onlyBhl: true }),
  });

  const { data: shiftsData } = useQuery({
    queryKey: ['shifts'],
    queryFn: settingsAPI.getShifts,
  });
  const shiftsList = shiftsData?.data || [];

  // Stats calculation
  const allBhlList = allBhlData?.data || [];
  const stats = {
    total: allBhlList.length,
    active: allBhlList.filter(e => e.status === 'Active').length,
    avgWage: allBhlList.length 
      ? Math.round(allBhlList.reduce((acc, curr) => acc + (curr.dailyRate || 0), 0) / allBhlList.length) 
      : 0
  };

  const addMutation = useMutation({
    mutationFn: async (payload) => {
      const { dailyWage, ...empData } = payload;
      const res = await employeeAPI.create(empData);
      if (res.data && dailyWage) {
        await payrollAPI.setEmployeeSalary(res.data.id, { 
          baseSalary: Number(dailyWage),
          dailyRate: Number(dailyWage),
          employmentType: 'HARIAN',
          salaryType: 'DAILY'
        }).catch(e => console.error("Failed to save salary", e));
      }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['bhl_employees']);
      queryClient.invalidateQueries(['bhl_employees_all']);
      queryClient.invalidateQueries(['employees-for-bhl']);
      setIsModalOpen(false);
    },
    onError: (error) => {
      alert(`${t('masterDataBhl.alerts.saveFailed')}${error.message || 'Unknown error'}`);
      console.error(error);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, dailyWage }) => {
      const res = await employeeAPI.update(id, data);
      if (dailyWage !== undefined && dailyWage !== '') {
        await payrollAPI.setEmployeeSalary(id, { 
          baseSalary: Number(dailyWage),
          dailyRate: Number(dailyWage),
          employmentType: 'HARIAN',
          salaryType: 'DAILY'
        }).catch(e => console.error("Failed to update salary", e));
      }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['bhl_employees']);
      queryClient.invalidateQueries(['bhl_employees_all']);
      queryClient.invalidateQueries(['employees-for-bhl']);
      setIsModalOpen(false);
    },
    onError: (error) => {
      alert(`${t('masterDataBhl.alerts.updateFailed')}${error.message || 'Unknown error'}`);
      console.error(error);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: employeeAPI.remove,
    onSuccess: () => {
      queryClient.invalidateQueries(['bhl_employees']);
      queryClient.invalidateQueries(['bhl_employees_all']);
      queryClient.invalidateQueries(['employees-for-bhl']);
    },
    onError: (error) => {
      alert(`${t('masterDataBhl.alerts.deleteFailed')}${error.message || 'Unknown error'}`);
      console.error(error);
    }
  });

  const handleSave = (e) => {
    e.preventDefault();
    const { dailyWage, status, ...restBhl } = newBhl;
    const payload = {
      ...restBhl,
      employmentStatus: 'HARIAN',
      salaryCategory: 'HARIAN',
      status: status || 'ACTIVE',
      email: restBhl.email || `bhl_${Date.now()}@example.com`,
    };

    if (newBhl.dbId) {
      updateMutation.mutate({ id: newBhl.dbId, data: payload, dailyWage });
    } else {
      addMutation.mutate({ ...payload, dailyWage });
    }
  };

  const handleEdit = async (emp) => {
    let currentWage = '';
    try {
      const sal = await payrollAPI.getEmployeeSalary(emp.dbId);
      const salaryObj = sal?.data?.salary;
      if (salaryObj) {
        currentWage = salaryObj.dailyRate || salaryObj.baseSalary || '';
      }
    } catch(e) {}

    setNewBhl({
      dbId: emp.dbId,
      name: emp.name,
      employeeCode: emp.employeeCode,
      dept: emp.dept || '',
      section: emp.section || '',
      position: emp.position || '',
      idNumber: emp.idNumber || '',
      phone: emp.phone || '',
      joinDate: emp.joinDate ? new Date(emp.joinDate).toISOString().split('T')[0] : '',
      email: emp.email,
      dailyWage: currentWage,
      shiftId: emp.shiftId || '',
      status: emp.status === 'Active' ? 'ACTIVE' : emp.status === 'On Leave' ? 'ON_LEAVE' : 'TERMINATED',
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    let defaultWage = '';
    if (settingsData?.data && settingsData.data.bhlDefaultDailyWage) {
      defaultWage = settingsData.data.bhlDefaultDailyWage;
    }
    setNewBhl({ 
      name: '', employeeCode: '', dept: '', section: '', position: '', 
      idNumber: '', phone: '', joinDate: '', dailyWage: defaultWage, shiftId: '', status: 'ACTIVE' 
    });
    setIsModalOpen(true);
  };

  const handleDelete = (emp) => {
    if (window.confirm(t('masterDataBhl.alerts.deleteConfirm', { name: emp.name }))) {
      deleteMutation.mutate(emp.dbId);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'NIK', 'Nama', 'NIK KTP', 'No HP', 'Departemen', 'Bagian', 'Jabatan', 'Tanggal Masuk', 'Upah Harian', 'Status Kerja'
    ];
    const sampleRow = [
      'BHL-0001', 'Supriatna', '3213051202760001', '081234567890', 'CS', 'CS', 'Cleaner', '2026-04-01', '103000', 'HARIAN'
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template BHL");
    
    ws['!cols'] = [
      {wch: 12}, {wch: 22}, {wch: 20}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 12}
    ];
    XLSX.writeFile(wb, "Template_Import_BHL.xlsx");
  };

  const handleExportExcel = async () => {
    try {
      const res = await employeeAPI.getAll({ 
        search: searchTerm, 
        limit: 5000, 
        onlyBhl: true, 
        status: statusFilter === 'All' ? 'All' : statusFilter 
      });
      const allBhl = res?.data || [];
      if (allBhl.length === 0) {
        alert(t("masterDataBhl.alerts.noDataExport"));
        return;
      }
      
      const exportData = allBhl.map((item, idx) => ({
        'No': idx + 1,
        'NIK': item.employeeCode,
        'Nama Lengkap': item.name,
        'No KTP / NIK': item.idNumber || '-',
        'Nomor HP': item.phone || '-',
        'Departemen': item.dept || '-',
        'Bagian / Section': item.section || '-',
        'Jabatan / Position': item.position || '-',
        'Tanggal Bergabung': item.joinDate ? new Date(item.joinDate).toLocaleDateString('id-ID') : '-',
        'Upah Harian (Rp)': item.dailyRate || 0,
        'Status Keaktifan': item.status || 'Active'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Master Data BHL");
      
      const wscols = [
        {wch: 5}, {wch: 15}, {wch: 25}, {wch: 22}, {wch: 15}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 18}, {wch: 15}
      ];
      ws['!cols'] = wscols;

      XLSX.writeFile(wb, `Master_Data_BHL_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (error) {
      alert(t("masterDataBhl.alerts.exportFailed") + error.message);
    }
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsImporting(true);
    const jobId = Date.now().toString();
    try {
      await employeeAPI.importExcel(file, jobId);
      alert(t("masterDataBhl.alerts.importSuccess"));
      queryClient.invalidateQueries(['bhl_employees']);
      queryClient.invalidateQueries(['bhl_employees_all']);
      queryClient.invalidateQueries(['employees-for-bhl']);
    } catch (err) {
      alert(`${t('masterDataBhl.alerts.importFailed')}${err.message}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const bhlList = data?.data || [];
  const totalRecords = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-6">
      {/* Quick Statistics Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between group hover:border-slate-300 transition-all duration-300">
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('masterDataBhl.totalRegistered')}</p>
            <h3 className="text-3xl font-black text-slate-800">{stats.total} <span className="text-xs font-semibold text-slate-400">{t('masterDataBhl.people')}</span></h3>
          </div>
          <div className="w-12 h-12 bg-slate-50 text-slate-500 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:scale-110 transition-all duration-300">
            <HardHat className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm flex items-center justify-between group hover:border-emerald-300 transition-all duration-300 bg-emerald-50/10">
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-emerald-600/80 uppercase tracking-widest">{t('masterDataBhl.activeBhl')}</p>
            <h3 className="text-3xl font-black text-emerald-600">{stats.active} <span className="text-xs font-semibold text-emerald-500/70">{t('masterDataBhl.people')}</span></h3>
          </div>
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100 group-hover:scale-110 transition-all duration-300">
            <ShieldCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-sm flex items-center justify-between group hover:border-blue-300 transition-all duration-300 bg-blue-50/10">
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-blue-600/80 uppercase tracking-widest">{t('masterDataBhl.avgWage')}</p>
            <h3 className="text-3xl font-black text-blue-600">Rp {stats.avgWage.toLocaleString('id-ID')}</h3>
          </div>
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center border border-blue-100 group-hover:scale-110 transition-all duration-300">
            <BadgeDollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Control Filter Bar */}
      <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder={t('masterDataBhl.searchPlaceholder')} 
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('masterDataBhl.statusLabel')}</label>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer transition-all"
            >
              <option value="ACTIVE">{t('masterDataBhl.statusActive')}</option>
              <option value="TERMINATED">{t('masterDataBhl.statusInactive')}</option>
              <option value="All">{t('masterDataBhl.statusAll')}</option>
            </select>
          </div>
        </div>

        {/* Action Utilities */}
        <div className="flex flex-wrap items-center gap-2.5">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportExcel} 
            accept=".xlsx,.xls" 
            className="hidden" 
          />
          
          <button 
            onClick={handleDownloadTemplate}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
            title="Download Template Excel BHL"
          >
            <Download className="w-3.5 h-3.5 text-blue-500" />
            Template
          </button>

          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
          >
            {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" /> : <Upload className="w-3.5 h-3.5 text-emerald-600" />}
            Import
          </button>

          <button 
            onClick={handleExportExcel}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all active:scale-95"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Export
          </button>

          <button 
            onClick={openAddModal}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5" /> {t('masterDataBhl.addBhl')}
          </button>
        </div>
      </div>

      {/* Main Table Grid */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('masterDataBhl.table.nik')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('masterDataBhl.table.name')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('masterDataBhl.table.ktp')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('masterDataBhl.table.phone')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('masterDataBhl.table.deptSectionPos')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('masterDataBhl.table.joinDate')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">{t('masterDataBhl.table.dailyWage')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">{t('masterDataBhl.table.status')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">{t('masterDataBhl.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan="9" className="text-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-2" />
                    <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{t('masterDataBhl.table.loading')}</p>
                  </td>
                </tr>
              ) : bhlList.length === 0 ? (
                <tr>
                  <td colSpan="9" className="text-center py-12 text-slate-500 text-xs">{t('masterDataBhl.table.noEmployees')}</td>
                </tr>
              ) : (
                bhlList.map(emp => (
                  <tr key={emp.dbId} className="hover:bg-emerald-50/30 transition-colors">
                    <td className="px-6 py-3 font-semibold text-slate-700">{emp.employeeCode}</td>
                    <td className="px-6 py-3 font-bold text-slate-800">{emp.name}</td>
                    <td className="px-6 py-3 text-slate-600">{emp.idNumber || '-'}</td>
                    <td className="px-6 py-3 text-slate-600">{emp.phone || '-'}</td>
                    <td className="px-6 py-3 text-slate-600">
                      {[emp.dept !== 'No Dept' ? emp.dept : '', emp.section, emp.position].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{emp.joinDate ? new Date(emp.joinDate).toLocaleDateString() : '-'}</td>
                    <td className="px-6 py-3 text-right font-bold text-slate-800">
                      Rp {(emp.dailyRate || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        emp.status === 'Active' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : emp.status === 'On Leave'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {emp.status === 'Active' ? t('masterDataBhl.modal.statusActiveOption') : emp.status === 'On Leave' ? t('masterDataBhl.modal.statusLeaveOption') : t('masterDataBhl.table.statusInactive')}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => handleEdit(emp)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(emp)} className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-[10px] font-semibold text-slate-500">
          <span>{t('masterDataBhl.table.showing')} {totalRecords} {t('masterDataBhl.table.records')}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-white border rounded hover:bg-slate-50 disabled:opacity-50">{t('masterDataBhl.table.prev')}</button>
            <span className="px-3 py-1 font-bold text-slate-700">{t('masterDataBhl.table.pageOf', { page, total: totalPages })}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-white border rounded hover:bg-slate-50 disabled:opacity-50">{t('masterDataBhl.table.next')}</button>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="bg-white rounded-2xl w-full max-w-2xl relative z-10 overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50/50">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">{newBhl.dbId ? t('masterDataBhl.modal.editTitle') : t('masterDataBhl.modal.addTitle')}</h3>
                <p className="text-xs text-slate-500 mt-1">{t('masterDataBhl.modal.autoNotice')}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-xl transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('masterDataBhl.modal.nikField')}</label>
                  <input value={newBhl.employeeCode} onChange={e => setNewBhl({...newBhl, employeeCode: e.target.value})} readOnly={!!newBhl.dbId} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('masterDataBhl.modal.fullName')}</label>
                  <input required value={newBhl.name} onChange={e => setNewBhl({...newBhl, name: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('masterDataBhl.modal.ktpField')}</label>
                  <input required value={newBhl.idNumber} onChange={e => setNewBhl({...newBhl, idNumber: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('masterDataBhl.modal.phoneField')}</label>
                  <input value={newBhl.phone} onChange={e => setNewBhl({...newBhl, phone: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('masterDataBhl.modal.deptField')}</label>
                  <input value={newBhl.dept} onChange={e => setNewBhl({...newBhl, dept: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('masterDataBhl.modal.sectionField')}</label>
                  <input value={newBhl.section} onChange={e => setNewBhl({...newBhl, section: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('masterDataBhl.modal.positionField')}</label>
                  <input value={newBhl.position} onChange={e => setNewBhl({...newBhl, position: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('masterDataBhl.modal.joinDateField')}</label>
                  <input type="date" value={newBhl.joinDate} onChange={e => setNewBhl({...newBhl, joinDate: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('masterDataBhl.modal.shiftField')}</label>
                  <select value={newBhl.shiftId} onChange={e => setNewBhl({...newBhl, shiftId: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all cursor-pointer">
                    <option value="">{t('masterDataBhl.modal.selectShiftPlaceholder')}</option>
                    {shiftsList.map(shift => (
                      <option key={shift.id} value={shift.id}>{shift.name} ({shift.startTime} - {shift.endTime})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('masterDataBhl.modal.statusField')}</label>
                  <select value={newBhl.status} onChange={e => setNewBhl({...newBhl, status: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all cursor-pointer">
                    <option value="ACTIVE">{t('masterDataBhl.modal.statusActiveOption')}</option>
                    <option value="ON_LEAVE">{t('masterDataBhl.modal.statusLeaveOption')}</option>
                    <option value="TERMINATED">{t('masterDataBhl.modal.statusTerminatedOption')}</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block">{t('masterDataBhl.modal.wageField')}</label>
                  <input type="number" value={newBhl.dailyWage} onChange={e => setNewBhl({...newBhl, dailyWage: e.target.value})} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" placeholder={t('masterDataBhl.modal.wagePlaceholder')} />
                </div>
              </div>
              
              <div className="mt-8 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all">{t('common.cancel')}</button>
                <button type="submit" disabled={addMutation.isPending || updateMutation.isPending} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50">
                  {addMutation.isPending || updateMutation.isPending ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
