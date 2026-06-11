import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { claimAPI, getFileUrl } from '../../services/api';
import { 
  Receipt, Loader2, Calendar, FileText, Coins, Check, X, Search, Filter
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const CATEGORY_COLORS = {
  MEDICAL: 'bg-emerald-50 text-emerald-800 border-emerald-100',
  TRAVEL: 'bg-blue-50 text-blue-800 border-blue-100',
  MEAL: 'bg-amber-50 text-amber-800 border-amber-100',
  OPERATIONAL: 'bg-indigo-50 text-indigo-800 border-indigo-100',
  OTHER: 'bg-slate-50 text-slate-800 border-slate-100'
};

const STATUS_COLORS = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-200'
};

const AdminClaims = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [activeClaimId, setActiveClaimId] = useState(null);
  const [reviewAction, setReviewAction] = useState(null); // 'APPROVE' or 'REJECT'
  const [previewImage, setPreviewImage] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['adminClaims', statusFilter],
    queryFn: () => claimAPI.getAll({ status: statusFilter !== 'All' ? statusFilter : undefined })
  });

  const claims = data?.data || [];

  const handleReviewMutation = useMutation({
    mutationFn: ({ id, status, note }) => claimAPI.review(id, status, note),
    onSuccess: (res) => {
      alert(res.message || t('common.success'));
      setActiveClaimId(null);
      setReviewAction(null);
      setReviewNote('');
      queryClient.invalidateQueries(['adminClaims']);
    },
    onError: (err) => {
      alert(`${t('common.error')}: ${err.message}`);
    }
  });

  const handleApprove = (id) => {
    setActiveClaimId(id);
    setReviewAction('APPROVE');
    setReviewNote('');
  };

  const handleReject = (id) => {
    setActiveClaimId(id);
    setReviewAction('REJECT');
    setReviewNote('');
  };

  const submitReview = () => {
    if (!activeClaimId) return;
    if (reviewAction === 'REJECT' && !reviewNote.trim()) {
      return alert(t('common.required'));
    }
    handleReviewMutation.mutate({
      id: activeClaimId,
      status: reviewAction === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      note: reviewNote
    });
  };

  const filteredClaims = claims.filter(c => 
    c.employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.employee.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const exportToPDF = () => {
    try {
      const doc = new jsPDF('landscape');
      
      // Page title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Smart HRIS Platform', 14, 20);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text(`Rekapitulasi Klaim Reimbursement (${statusFilter === 'All' ? 'Semua Status' : statusFilter})`, 14, 28);
      doc.setFontSize(10);
      doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 14, 34);
      
      const tableColumn = ["No", "Karyawan", "NIK", "Departemen", "Judul Klaim", "Kategori", "Nominal", "Tanggal", "Status"];
      const tableRows = [];
      
      filteredClaims.forEach((claim, index) => {
        const dateStr = new Date(claim.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const amountStr = `Rp ${claim.amount.toLocaleString('id-ID')}`;
        const categoryStr = t(`claims.categories.${claim.category}`) || claim.category;
        const statusStr = t(`claims.statuses.${claim.status}`) || claim.status;
        const deptStr = claim.employee.department?.name || 'Umum';
        
        tableRows.push([
          index + 1,
          claim.employee.name,
          claim.employee.employeeCode,
          deptStr,
          claim.title,
          categoryStr,
          amountStr,
          dateStr,
          statusStr
        ]);
      });
      
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        styles: { fontSize: 9, font: 'helvetica' },
        headStyles: { fillColor: [37, 99, 235], halign: 'center' }, // Royal Blue
        columnStyles: {
          6: { halign: 'right' },
          8: { halign: 'center' }
        }
      });
      
      doc.save(`Rekap_Klaim_${statusFilter}_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert('Gagal mengekspor PDF. Pastikan data termuat dengan benar.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('claims.adminTitle')}</h1>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-1">{t('claims.adminSubtitle')}</p>
        </div>
        <button 
          onClick={exportToPDF}
          disabled={filteredClaims.length === 0}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:opacity-70 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer self-start md:self-auto shrink-0"
        >
          <FileText className="w-4 h-4" />
          Ekspor PDF Rekap
        </button>
      </div>

      {/* Tabs & Search */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-100 gap-1 overflow-x-auto shrink-0">
          {['PENDING', 'APPROVED', 'REJECTED', 'All'].map(statusVal => (
            <button
              key={statusVal}
              onClick={() => setStatusFilter(statusVal)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                statusFilter === statusVal
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {statusVal === 'All' ? t('claims.allClaims') : t(`claims.statuses.${statusVal}`)}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('claims.searchPlaceholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700 placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      {/* Table List */}
      {isLoading ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-sm flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : filteredClaims.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-sm text-center space-y-3">
          <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-500">{t('claims.noAdminClaims')}</p>
          <p className="text-xs text-slate-400">{t('claims.noAdminClaimsDesc')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider bg-slate-50/70">
                  <th className="py-4 px-6">{t('claims.table.employee')}</th>
                  <th className="py-4 px-6">{t('claims.table.categoryTitle')}</th>
                  <th className="py-4 px-6">{t('claims.table.amount')}</th>
                  <th className="py-4 px-6">{t('claims.table.date')}</th>
                  <th className="py-4 px-6">{t('claims.table.receipt')}</th>
                  <th className="py-4 px-6 text-right">{t('claims.table.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClaims.map(claim => (
                  <tr key={claim.id} className="hover:bg-slate-50/50 text-sm text-slate-700 transition-all">
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-800">{claim.employee.name}</div>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{claim.employee.employeeCode} • {claim.employee.department?.name || 'Umum'}</div>
                    </td>
                    <td className="py-4 px-6 space-y-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${CATEGORY_COLORS[claim.category] || 'bg-slate-50 text-slate-700'}`}>
                        {t(`claims.categories.${claim.category}`)}
                      </span>
                      <div className="font-semibold text-slate-700">{claim.title}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="font-extrabold text-blue-600 text-base">Rp {claim.amount.toLocaleString()}</span>
                    </td>
                    <td className="py-4 px-6 font-medium text-slate-500">
                      {new Date(claim.createdAt).toLocaleDateString(t('common.date') === 'Tanggal' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="py-4 px-6">
                      <button 
                        onClick={() => setPreviewImage(getFileUrl(claim.receiptUrl))}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-all"
                      >
                        <FileText className="w-3.5 h-3.5" /> {t('claims.viewReceipt')}
                      </button>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {claim.status === 'PENDING' ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleApprove(claim.id)}
                            className="inline-flex items-center justify-center p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-bold transition-all"
                            title={t('claims.approve')}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleReject(claim.id)}
                            className="inline-flex items-center justify-center p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-all"
                            title={t('claims.reject')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[claim.status]}`}>
                            {t(`claims.statuses.${claim.status}`)}
                          </span>
                          {claim.payroll && (
                            <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center justify-end gap-1">
                              <Coins className="w-3 h-3" /> Slip {claim.payroll.period}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Review Modal Form */}
      {activeClaimId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setActiveClaimId(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">
                {reviewAction === 'APPROVE' ? t('claims.approveTitle') : t('claims.rejectTitle')}
              </h3>
              <button onClick={() => setActiveClaimId(null)} className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center border border-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-medium">
                {reviewAction === 'APPROVE' ? t('claims.approveHelp') : t('claims.rejectHelp')}
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {t('claims.noteLabel')} {reviewAction === 'REJECT' && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  placeholder={reviewAction === 'APPROVE' ? t('claims.noteLabel') : t('claims.noteLabel')}
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700 min-h-[100px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button 
                onClick={() => setActiveClaimId(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all uppercase tracking-wider"
              >
                {t('claims.cancel')}
              </button>
              <button 
                onClick={submitReview}
                disabled={handleReviewMutation.isPending || (reviewAction === 'REJECT' && !reviewNote.trim())}
                className={`px-4 py-2 rounded-lg text-white font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95 disabled:opacity-50 ${
                  reviewAction === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                }`}
              >
                {handleReviewMutation.isPending ? t('claims.processing') : reviewAction === 'APPROVE' ? t('claims.approve') : t('claims.reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="absolute inset-0 cursor-zoom-out" onClick={() => setPreviewImage(null)} />
          <div className="relative max-w-4xl max-h-[85vh] w-full bg-white rounded-2xl overflow-hidden p-2 flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setPreviewImage(null)} 
              className="absolute top-4 right-4 w-9 h-9 bg-black/60 text-white rounded-xl flex items-center justify-center hover:bg-black/80 transition-all z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-slate-100 rounded-xl">
              {previewImage.toLowerCase().endsWith('.pdf') ? (
                <iframe src={previewImage} title="pdf-viewer" className="w-full h-[70vh] border-0 rounded-lg" />
              ) : (
                <img src={previewImage} alt="receipt-preview" className="max-w-full max-h-[75vh] object-contain rounded-lg" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminClaims;
