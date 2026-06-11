import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kpiAPI, employeeAPI } from '../../services/api';
import { 
  Plus, Trash2, Award, Calculator, Loader2, Sparkles, TrendingUp, Check, X, Users, BarChart3, Medal, FileText
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const STATUS_COLORS = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-200'
};

const KPIEvaluation = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' or 'evaluate'
  const [selectedPeriod, setSelectedPeriod] = useState('2026-Q1');
  const [selectedEmpId, setSelectedEmpId] = useState('');
  
  // KPI items state
  const [kpiRows, setKpiRows] = useState([
    { kpiName: 'Kehadiran & Kedisiplinan', weight: 30, target: '100%', actual: '98%', score: 95 },
    { kpiName: 'Pencapaian Target Kerja', weight: 40, target: '100%', actual: '95%', score: 90 },
    { kpiName: 'Kerjasama Tim & Komunikasi', weight: 30, target: '100%', actual: '90%', score: 85 }
  ]);
  const [evalReviewNote, setEvalReviewNote] = useState('');
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [evalSearchQuery, setEvalSearchQuery] = useState('');
  const [evalDeptFilter, setEvalDeptFilter] = useState('');

  // Attendance rate fetching state
  const [attendanceData, setAttendanceData] = useState(null);
  const [isFetchingAttendance, setIsFetchingAttendance] = useState(false);
  
  // HR approval modal state
  const [activeKpiId, setActiveKpiId] = useState(null);
  const [approvalAction, setApprovalAction] = useState(null);
  const [approvalNote, setApprovalNote] = useState('');

  // Fetch employees options
  const { data: empData } = useQuery({
    queryKey: ['activeEmployees'],
    queryFn: () => employeeAPI.getAll({ limit: 1000 })
  });
  const employees = empData?.data || [];

  // Fetch KPI list
  const { data: kpiListData, isLoading: isListLoading } = useQuery({
    queryKey: ['kpiList', selectedPeriod],
    queryFn: () => kpiAPI.getAll({ period: selectedPeriod })
  });
  const kpis = kpiListData?.data || [];

  // Fetch KPI Stats for Dashboard
  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ['kpiStats', selectedPeriod],
    queryFn: () => kpiAPI.getStats(selectedPeriod),
    enabled: !!selectedPeriod
  });
  const stats = statsData?.data || null;

  const user = JSON.parse(sessionStorage.getItem('user') || '{}');
  const isAdminOrAccounting = ['ADMIN', 'SUPER_ADMIN', 'ACCOUNTING'].includes(user.role);
  const isManager = user.role === 'MANAGER';

  // Fetch Attendance Rate when employee or period changes
  useEffect(() => {
    if (!selectedEmpId || !selectedPeriod) {
      setAttendanceData(null);
      return;
    }

    setIsFetchingAttendance(true);
    kpiAPI.getAttendancePercentage(selectedEmpId, selectedPeriod)
      .then(res => {
        if (res.success && res.data) {
          setAttendanceData(res.data);
        } else {
          setAttendanceData(null);
        }
      })
      .catch(err => {
        console.error('[KPIEvaluation] Error fetching attendance percentage:', err);
        setAttendanceData(null);
      })
      .finally(() => {
        setIsFetchingAttendance(false);
      });
  }, [selectedEmpId, selectedPeriod]);

  // Derived lists and filters
  const departmentsList = Array.from(
    new Set(
      employees
        .map(emp => emp.dept || emp.department?.name)
        .filter(Boolean)
    )
  ).sort();

  const filteredKpis = kpis.filter(kpi => {
    const matchesSearch = searchQuery === '' || 
      (kpi.employee?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (kpi.employee?.employeeCode || '').toLowerCase().includes(searchQuery.toLowerCase());
      
    const kpiDept = kpi.employee?.department?.name || 'No Dept';
    const matchesDept = deptFilter === '' || kpiDept === deptFilter;
    
    return matchesSearch && matchesDept;
  });

  const filteredEmployeesForEval = employees.filter(emp => {
    if (String(emp.dbId || emp.id) === String(selectedEmpId)) return true;

    const matchesSearch = evalSearchQuery === '' || 
      (emp.name || '').toLowerCase().includes(evalSearchQuery.toLowerCase()) ||
      (emp.employeeCode || '').toLowerCase().includes(evalSearchQuery.toLowerCase());
      
    const matchesDept = evalDeptFilter === '' || (emp.dept || '') === evalDeptFilter;
    
    return matchesSearch && matchesDept;
  });

  // Calculations
  const calculatedFinalScore = kpiRows.reduce((sum, row) => {
    const w = parseFloat(row.weight) || 0;
    const s = parseFloat(row.score) || 0;
    return sum + (s * w) / 100;
  }, 0);

  const totalWeight = kpiRows.reduce((sum, row) => sum + (parseFloat(row.weight) || 0), 0);

  // Mutations
  const submitEvaluationMutation = useMutation({
    mutationFn: (data) => kpiAPI.submit(data),
    onSuccess: (res) => {
      alert(res.message || t('common.success'));
      setSelectedEmpId('');
      setEvalReviewNote('');
      setActiveTab('dashboard');
      queryClient.invalidateQueries(['kpiList']);
      queryClient.invalidateQueries(['kpiStats']);
    },
    onError: (err) => {
      alert(`${t('common.error')}: ${err.message}`);
    }
  });

  const reviewKpiMutation = useMutation({
    mutationFn: ({ id, status, note }) => kpiAPI.review(id, status, note),
    onSuccess: (res) => {
      alert(res.message || t('common.success'));
      setActiveKpiId(null);
      setApprovalAction(null);
      setApprovalNote('');
      queryClient.invalidateQueries(['kpiList']);
      queryClient.invalidateQueries(['kpiStats']);
    },
    onError: (err) => {
      alert(`${t('common.error')}: ${err.message}`);
    }
  });

  const handleAddRow = () => {
    setKpiRows([...kpiRows, { kpiName: '', weight: 10, target: '', actual: '', score: 80 }]);
  };

  const handleRemoveRow = (index) => {
    if (kpiRows.length === 1) return;
    setKpiRows(kpiRows.filter((_, i) => i !== index));
  };

  const handleRowChange = (index, field, value) => {
    const updated = [...kpiRows];
    updated[index][field] = value;
    setKpiRows(updated);
  };

  const handleSaveEvaluation = (e) => {
    e.preventDefault();
    if (!selectedEmpId) return alert(t('kpi.selectEmployee'));
    if (Math.abs(totalWeight - 100) > 0.01) {
      return alert(t('kpi.weightInvalid'));
    }
    submitEvaluationMutation.mutate({
      employeeId: parseInt(selectedEmpId),
      period: selectedPeriod,
      targetKPI: kpiRows,
      reviewNote: evalReviewNote
    });
  };

  const handleApprove = (id) => {
    setActiveKpiId(id);
    setApprovalAction('APPROVE');
    setApprovalNote('');
  };

  const handleReject = (id) => {
    setActiveKpiId(id);
    setApprovalAction('REJECT');
    setApprovalNote('');
  };

  const submitKpiReview = () => {
    if (!activeKpiId) return;
    if (approvalAction === 'REJECT' && !approvalNote.trim()) {
      return alert(t('common.required'));
    }
    reviewKpiMutation.mutate({
      id: activeKpiId,
      status: approvalAction === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      note: approvalNote
    });
  };

  const exportKPIToPDF = (kpi) => {
    try {
      const doc = new jsPDF();
      
      // Border & premium frame
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.rect(5, 5, 200, 287);
      
      // Logo & Header
      doc.setFillColor(37, 99, 235); // Royal Blue
      doc.rect(14, 15, 182, 3, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42); // slate-900
      doc.text('SMART HRIS PLATFORM', 14, 28);
      
      doc.setFontSize(10);
      doc.setTextColor(100, 116, 139); // slate-500
      doc.text('Sistem Manajemen Kinerja & Evaluasi Karyawan', 14, 33);
      doc.text('Telepon: +62 812-3456-7890 | Email: support@smarthris.com', 14, 38);
      
      doc.setDrawColor(241, 245, 249); // slate-100
      doc.line(14, 42, 196, 42);
      
      // Document Title
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59); // slate-800
      doc.text('RAPOR EVALUASI KINERJA (KPI)', 14, 50);
      
      // Employee Info Grid (Two columns)
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('INFORMASI KARYAWAN', 14, 58);
      
      doc.setFillColor(248, 250, 252); // slate-50
      doc.rect(14, 61, 182, 32, 'F');
      doc.rect(14, 61, 182, 32, 'D');
      
      doc.setFont('helvetica', 'normal');
      doc.text(`Nama Karyawan  :  ${kpi.employee.name}`, 18, 68);
      doc.text(`NIK Karyawan   :  ${kpi.employee.employeeCode}`, 18, 74);
      doc.text(`Jabatan        :  ${kpi.employee.position || '-'}`, 18, 80);
      doc.text(`Departemen     :  ${kpi.employee.department?.name || 'Umum'}`, 18, 86);
      
      doc.text(`Periode Penilaian :  ${kpi.period}`, 110, 68);
      doc.text(`Tanggal Cetak     :  ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`, 110, 74);
      doc.text(`Dinilai Oleh      :  @${kpi.evaluatedBy}`, 110, 80);
      doc.text(`Status Kelulusan  :  ${kpi.status === 'APPROVED' ? 'DISETUJUI (SAH)' : 'MENUNGGU PERSETUJUAN'}`, 110, 86);
      
      // KPI Details Table
      doc.setFont('helvetica', 'bold');
      doc.text('DETAIL PENCAPAIAN SASARAN KERJA', 14, 101);
      
      const tableColumn = ["No", "Indikator Kinerja (KPI)", "Bobot", "Target", "Realisasi", "Nilai (0-100)", "Skor Tertimbang"];
      const tableRows = [];
      
      let kpiDetails = [];
      try {
        kpiDetails = typeof kpi.targetKPI === 'string' ? JSON.parse(kpi.targetKPI) : kpi.targetKPI;
      } catch (e) {
        kpiDetails = kpi.targetKPI || [];
      }
      
      kpiDetails.forEach((item, index) => {
        const weightVal = parseFloat(item.weight) || 0;
        const scoreVal = parseFloat(item.score) || 0;
        const weightedScore = (scoreVal * weightVal) / 100;
        tableRows.push([
          index + 1,
          item.kpiName,
          `${weightVal}%`,
          item.target || '-',
          item.actual || '-',
          scoreVal,
          weightedScore.toFixed(2)
        ]);
      });
      
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 104,
        styles: { fontSize: 9, font: 'helvetica' },
        headStyles: { fillColor: [37, 99, 235], halign: 'center' }, // Royal Blue
        columnStyles: {
          2: { halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' },
          5: { halign: 'center', fontStyle: 'bold' },
          6: { halign: 'center', fontStyle: 'bold' }
        }
      });
      
      const finalY = doc.lastAutoTable.finalY + 8;
      
      // Final Score Box
      doc.setFillColor(239, 246, 255); // blue-50
      doc.rect(14, finalY, 182, 16, 'F');
      doc.setDrawColor(191, 219, 254); // blue-200
      doc.rect(14, finalY, 182, 16, 'D');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('TOTAL SKOR EVALUASI AKHIR (WEIGHTED SCORE):', 18, finalY + 10);
      
      doc.setFontSize(16);
      doc.setTextColor(37, 99, 235); // Royal Blue
      doc.text(String(kpi.finalScore || '0'), 160, finalY + 11);
      
      // Note/Feedback from evaluator
      if (kpi.reviewNote) {
        const feedbackY = finalY + 22;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(100, 116, 139);
        doc.text('Catatan Evaluator / HRD:', 14, feedbackY);
        
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        
        const splitNote = doc.splitTextToSize(kpi.reviewNote, 180);
        doc.text(splitNote, 14, feedbackY + 5);
      }
      
      // Signature Section
      const signatureY = finalY + 55;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      
      doc.text('Karyawan Bersangkutan,', 25, signatureY);
      doc.line(25, signatureY + 20, 75, signatureY + 20);
      doc.setFont('helvetica', 'normal');
      doc.text(kpi.employee.name, 25, signatureY + 24);
      
      doc.setFont('helvetica', 'bold');
      doc.text('Evaluator (Manager/HRD),', 125, signatureY);
      doc.line(125, signatureY + 20, 175, signatureY + 20);
      doc.setFont('helvetica', 'normal');
      doc.text(`@${kpi.evaluatedBy}`, 125, signatureY + 24);
      
      // Footer page numbers
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text('Dokumen ini dihasilkan secara otomatis oleh Smart HRIS Platform. Sah dan berlaku tanpa tanda tangan basah.', 14, 280);
      
      doc.save(`Rapor_KPI_${kpi.employee.name.replace(/\s+/g, '_')}_${kpi.period}.pdf`);
    } catch (err) {
      console.error('Failed to generate KPI PDF:', err);
      alert('Gagal mengekspor PDF Rapor KPI.');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('kpi.title')}</h1>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-1">{t('kpi.subtitle')}</p>
        </div>

        <div className="flex gap-3 shrink-0">
          <select 
            value={selectedPeriod} 
            onChange={e => setSelectedPeriod(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="2026-Q1">{t('kpi.periods.q1')} (2026-Q1)</option>
            <option value="2026-Q2">{t('kpi.periods.q2')} (2026-Q2)</option>
            <option value="2026-Q3">{t('kpi.periods.q3')} (2026-Q3)</option>
            <option value="2026-Q4">{t('kpi.periods.q4')} (2026-Q4)</option>
            <option value="2026-Annual">{t('kpi.periods.annual')} (2026-Annual)</option>
          </select>

          {(isManager || isAdminOrAccounting) && (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button 
                onClick={() => setActiveTab('dashboard')} 
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'dashboard' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                {t('kpi.tabDashboard')}
              </button>
              <button 
                onClick={() => setActiveTab('evaluate')} 
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'evaluate' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                {t('kpi.tabInput')}
              </button>
            </div>
          )}
        </div>
      </div>

      {activeTab === 'dashboard' ? (
        <div className="space-y-6">
          {/* Stats Summary */}
          {isStatsLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
          ) : stats ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 border border-blue-100"><Users className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{t('kpi.stats.totalEvaluated')}</p>
                  <p className="text-xl font-extrabold text-slate-800">{stats.totalEvaluated} {t('kpi.stats.staf')}</p>
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 border border-emerald-100"><Award className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{t('kpi.stats.averageScore')}</p>
                  <p className="text-xl font-extrabold text-emerald-600">{stats.averageScore} / 100</p>
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 border border-amber-100"><TrendingUp className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{t('kpi.stats.gradeA')}</p>
                  <p className="text-xl font-extrabold text-slate-800">{stats.distribution.A} {t('kpi.stats.staf')}</p>
                </div>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-violet-50 rounded-xl flex items-center justify-center text-violet-600 border border-violet-100"><Award className="w-5 h-5" /></div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{t('kpi.stats.gradeB')}</p>
                  <p className="text-xl font-extrabold text-slate-800">{stats.distribution.B} {t('kpi.stats.staf')}</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Leaderboard and Department performance */}
            <div className="lg:col-span-1 space-y-6">
              {/* Leaderboard */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Medal className="w-4 h-4 text-amber-500" /> {t('kpi.bestPerformer')}
                </h3>
                {stats?.topPerformers.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">{t('kpi.noApprovedKpi')}</p>
                ) : (
                  <div className="space-y-3">
                    {stats?.topPerformers.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
                        <div className="overflow-hidden">
                          <span className="font-bold text-slate-700 text-sm">{idx + 1}. {p.name}</span>
                          <span className="text-[10px] font-semibold text-slate-400 uppercase block tracking-wider">{p.department}</span>
                        </div>
                        <span className="font-black text-blue-600 text-sm shrink-0">{p.score}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Department averages */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" /> {t('kpi.deptAverage')}
                </h3>
                {stats?.departmentAverages.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">{t('kpi.noApprovedKpi')}</p>
                ) : (
                  <div className="space-y-3">
                    {stats?.departmentAverages.map((d, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-slate-700">
                          <span>{d.name}</span>
                          <span>{d.average} / 100</span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                          <div className="bg-blue-500 h-full" style={{ width: `${Math.min(d.average, 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Main KPI list */}
            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Award className="w-4 h-4 text-blue-600" /> {t('kpi.listTitle')}
                </h3>
                
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <input
                    type="text"
                    placeholder={t('kpi.searchPlaceholder') || "Search..."}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <select
                    value={deptFilter}
                    onChange={e => setDeptFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">{t('kpi.filterAllDepts') || "Semua Departemen"}</option>
                    {departmentsList.map(dept => (
                      <option key={dept} value={dept}>{dept}</option>
                    ))}
                  </select>
                </div>
              </div>

              {isListLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
              ) : kpis.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-12">{t('kpi.noKpiPeriod')}</p>
              ) : filteredKpis.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-12">Tidak ada hasil pencarian yang cocok.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider bg-slate-50/70">
                        <th className="py-3 px-4">{t('kpi.table.employee')}</th>
                        <th className="py-3 px-4">{t('kpi.table.evaluation')}</th>
                        <th className="py-3 px-4">{t('kpi.table.finalScore')}</th>
                        <th className="py-3 px-4 text-right">{t('kpi.table.status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredKpis.map(kpi => (
                        <tr key={kpi.id} className="text-sm hover:bg-slate-50/50">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{kpi.employee.name}</div>
                            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{kpi.employee.employeeCode} • {kpi.employee.position}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-600">{t('kpi.periodLabel')}: {kpi.period}</div>
                            <div className="text-[10px] text-slate-400">{t('kpi.evaluatedByLabel')}: @{kpi.evaluatedBy}</div>
                          </td>
                          <td className="py-3.5 px-4 font-black text-blue-600 text-base">
                            {kpi.finalScore}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex justify-end items-center gap-2">
                              <button
                                onClick={() => exportKPIToPDF(kpi)}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                title={t('kpi.printReport')}
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                              {kpi.status === 'PENDING' && isAdminOrAccounting ? (
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => handleApprove(kpi.id)}
                                    className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-bold transition-all"
                                    title={t('kpi.approve')}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleReject(kpi.id)}
                                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-all"
                                    title={t('kpi.reject')}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[kpi.status]}`}>
                                  {t(`claims.statuses.${kpi.status}`)}
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Evaluation Input form */
        <form onSubmit={handleSaveEvaluation} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" /> {t('kpi.formTitle')}
            </h3>
            <p className="text-xs text-slate-400">{t('kpi.formSubtitle')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">{t('kpi.labelEmployee')}</label>
              
              {/* Filter inputs for employee selection */}
              <div className="flex gap-2 mb-1.5">
                <input
                  type="text"
                  placeholder={t('kpi.searchPlaceholder') || "Search name/NIK..."}
                  value={evalSearchQuery}
                  onChange={e => setEvalSearchQuery(e.target.value)}
                  className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <select
                  value={evalDeptFilter}
                  onChange={e => setEvalDeptFilter(e.target.value)}
                  className="w-1/2 bg-slate-50 border border-slate-200 rounded-xl px-1.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">{t('kpi.filterAllDepts') || "Semua Dept"}</option>
                  {departmentsList.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              <select
                value={selectedEmpId}
                onChange={e => setSelectedEmpId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 font-semibold"
                required
              >
                <option value="">
                  {filteredEmployeesForEval.length === 0 
                    ? "Tidak ada hasil" 
                    : t('kpi.selectEmployee')}
                </option>
                {filteredEmployeesForEval.map(emp => (
                  <option key={emp.dbId || emp.id} value={emp.dbId || emp.id}>
                    {emp.name} ({emp.employeeCode} - {emp.position}) [{emp.dept}]
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">{t('kpi.labelPeriod')}</label>
              <input
                type="text"
                value={selectedPeriod}
                disabled
                className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-500 cursor-not-allowed"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">{t('kpi.labelTotalWeight')}</label>
              <div className={`w-full border rounded-xl px-4 py-3 text-sm font-black flex justify-between items-center ${
                Math.abs(totalWeight - 100) < 0.01 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}>
                <span>{totalWeight} %</span>
                <span className="text-[10px] font-bold uppercase tracking-wider">{Math.abs(totalWeight - 100) < 0.01 ? t('kpi.weightValid') : t('kpi.weightInvalid')}</span>
              </div>
            </div>
          </div>

          {/* Attendance Auto-Fetch Card */}
          {selectedEmpId && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center text-blue-600 shrink-0">
                  {isFetchingAttendance ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Calculator className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    Rangkuman Absensi Periode Ini ({selectedPeriod})
                  </h4>
                  {isFetchingAttendance ? (
                    <p className="text-xs text-slate-400 font-medium">Menghitung kehadiran dari data log...</p>
                  ) : attendanceData ? (
                    <p className="text-xs text-slate-500 font-medium">
                      Hadir: <span className="font-bold text-slate-700">{attendanceData.present} hari</span> | 
                      Cuti/Izin/Sakit: <span className="font-bold text-slate-700">{attendanceData.leave} hari</span> | 
                      Mangkir/Alpa: <span className="font-bold text-rose-600">{attendanceData.absent} hari</span>
                      {attendanceData.holiday > 0 && ` | Libur: ${attendanceData.holiday} hari`}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-400 font-medium">Tidak ada log absensi terdaftar.</p>
                  )}
                </div>
              </div>

              {!isFetchingAttendance && attendanceData && (
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Persentase Kehadiran</span>
                    <span className="text-lg font-black text-blue-600">{attendanceData.attendanceRate}%</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      // Automatically find the row for Kehadiran / Attendance and fill it
                      const updated = kpiRows.map(row => {
                        const isKehadiran = row.kpiName.toLowerCase().includes('kehadiran') || 
                                           row.kpiName.toLowerCase().includes('absen') ||
                                           row.kpiName.toLowerCase().includes('attendance') ||
                                           row.kpiName.toLowerCase().includes('presence');
                        if (isKehadiran) {
                          return {
                            ...row,
                            actual: `${attendanceData.attendanceRate}%`,
                            score: Math.round(attendanceData.attendanceRate)
                          };
                        }
                        return row;
                      });
                      setKpiRows(updated);
                      alert("Persentase kehadiran berhasil di-apply ke item 'Kehadiran & Kedisiplinan'!");
                    }}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-500/20"
                  >
                    Gunakan Nilai Ini
                  </button>
                </div>
              )}
            </div>
          )}

          {/* KPI Rows Entry */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('kpi.indicatorsTitle')}</h4>
              <button 
                type="button" 
                onClick={handleAddRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-all border border-blue-100"
              >
                <Plus className="w-3.5 h-3.5" /> {t('kpi.addIndicator')}
              </button>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4 w-[40%]">{t('kpi.tableHeaders.name')}</th>
                    <th className="py-3 px-4 w-[15%]">{t('kpi.tableHeaders.weight')}</th>
                    <th className="py-3 px-4 w-[15%]">{t('kpi.tableHeaders.target')}</th>
                    <th className="py-3 px-4 w-[15%]">{t('kpi.tableHeaders.actual')}</th>
                    <th className="py-3 px-4 w-[15%]">{t('kpi.tableHeaders.score')}</th>
                    <th className="py-3 px-4 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {kpiRows.map((row, index) => (
                    <tr key={index} className="hover:bg-slate-50/30 text-sm">
                      <td className="py-2.5 px-4">
                        <input
                          type="text"
                          placeholder={t('kpi.placeholders.indicatorName')}
                          value={row.kpiName}
                          onChange={e => handleRowChange(index, 'kpiName', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700"
                          required
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <input
                          type="number"
                          value={row.weight}
                          onChange={e => handleRowChange(index, 'weight', parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                          required
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <input
                          type="text"
                          placeholder={t('kpi.placeholders.target')}
                          value={row.target}
                          onChange={e => handleRowChange(index, 'target', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <input
                          type="text"
                          placeholder={t('kpi.placeholders.actual')}
                          value={row.actual}
                          onChange={e => handleRowChange(index, 'actual', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2.5 px-4">
                        <input
                          type="number"
                          value={row.score}
                          onChange={e => handleRowChange(index, 'score', parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-blue-600"
                          min="0"
                          max="100"
                          required
                        />
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(index)}
                          disabled={kpiRows.length === 1}
                          className="p-1.5 text-slate-400 hover:text-red-500 disabled:opacity-30 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Dynamic weighted score review note */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">{t('kpi.feedbackLabel')}</label>
              <textarea
                placeholder={t('kpi.feedbackPlaceholder')}
                value={evalReviewNote}
                onChange={e => setEvalReviewNote(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700 min-h-[100px]"
              />
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col justify-center items-center text-center space-y-2">
              <Calculator className="w-8 h-8 text-blue-600" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t('kpi.weightedScoreEst')}</p>
              <p className="text-3xl font-black text-blue-600">{Math.round(calculatedFinalScore * 100) / 100}</p>
              <p className="text-[10px] text-slate-400">{t('kpi.weightedScoreHelp')}</p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setSelectedEmpId('');
                setEvalReviewNote('');
                setActiveTab('dashboard');
              }}
              className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-bold text-xs uppercase tracking-wider hover:bg-slate-50 transition-all"
            >
              {t('kpi.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitEvaluationMutation.isPending || Math.abs(totalWeight - 100) > 0.01}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 active:scale-95"
            >
              {submitEvaluationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Award className="w-4 h-4" />}
              {t('kpi.save')}
            </button>
          </div>
        </form>
      )}

      {/* Review KPI Modal (HR Approval) */}
      {activeKpiId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setActiveKpiId(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">
                {approvalAction === 'APPROVE' ? t('kpi.approveTitle') : t('kpi.rejectTitle')}
              </h3>
              <button onClick={() => setActiveKpiId(null)} className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center border border-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-medium">
                {approvalAction === 'APPROVE' ? t('kpi.approveHelp') : t('kpi.rejectHelp')}
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {t('kpi.reviewNoteLabel')} {approvalAction === 'REJECT' && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  placeholder={approvalAction === 'APPROVE' ? t('kpi.reviewNotePlaceholder') : t('kpi.rejectNotePlaceholder')}
                  value={approvalNote}
                  onChange={e => setApprovalNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700 min-h-[100px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button 
                onClick={() => setActiveKpiId(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all uppercase tracking-wider"
              >
                {t('kpi.cancel')}
              </button>
              <button 
                onClick={submitKpiReview}
                disabled={reviewKpiMutation.isPending || (approvalAction === 'REJECT' && !approvalNote.trim())}
                className={`px-4 py-2 rounded-lg text-white font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95 disabled:opacity-50 ${
                  approvalAction === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                }`}
              >
                {reviewKpiMutation.isPending ? t('kpi.processing') : approvalAction === 'APPROVE' ? t('kpi.approve') : t('kpi.reject')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KPIEvaluation;
