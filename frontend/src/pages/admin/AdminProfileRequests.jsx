import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { profileUpdateAPI, getFileUrl } from '../../services/api';
import { 
  User, Loader2, FileText, Check, X, Search
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const STATUS_COLORS = {
  PENDING: 'bg-amber-50 text-amber-800 border-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-800 border-rose-200'
};

const AdminProfileRequests = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [reviewAction, setReviewAction] = useState(null); // 'APPROVE' or 'REJECT'
  const [previewFile, setPreviewFile] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['adminProfileRequests', statusFilter],
    queryFn: () => profileUpdateAPI.getAll({ status: statusFilter !== 'All' ? statusFilter : undefined })
  });

  const requests = data?.data || [];

  const handleReviewMutation = useMutation({
    mutationFn: ({ id, status, note }) => profileUpdateAPI.review(id, status, note),
    onSuccess: (res) => {
      alert(res.message || t('common.success'));
      setActiveRequestId(null);
      setReviewAction(null);
      setReviewNote('');
      queryClient.invalidateQueries(['adminProfileRequests']);
    },
    onError: (err) => {
      alert(`${t('common.error')}: ${err.message}`);
    }
  });

  const handleApprove = (id) => {
    setActiveRequestId(id);
    setReviewAction('APPROVE');
    setReviewNote('');
  };

  const handleReject = (id) => {
    setActiveRequestId(id);
    setReviewAction('REJECT');
    setReviewNote('');
  };

  const submitReview = () => {
    if (!activeRequestId) return;
    if (reviewAction === 'REJECT' && !reviewNote.trim()) {
      return alert(t('common.required'));
    }
    handleReviewMutation.mutate({
      id: activeRequestId,
      status: reviewAction === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      note: reviewNote
    });
  };

  const getFieldLabel = (fieldName) => {
    const key = `profileRequests.fields.${fieldName}`;
    const val = t(key);
    return val !== key ? val : fieldName;
  };

  const filteredRequests = requests.filter(r => 
    r.employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.employee.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getFieldLabel(r.fieldName).toLowerCase().includes(searchTerm.toLowerCase())
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
      doc.text(`Log Koreksi Profil Mandiri ESS (${statusFilter === 'All' ? 'Semua Status' : statusFilter})`, 14, 28);
      doc.setFontSize(10);
      doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 14, 34);
      
      const tableColumn = ["No", "Karyawan", "NIK", "Departemen", "Nama Field", "Nilai Lama", "Nilai Baru", "Tanggal", "Status"];
      const tableRows = [];
      
      filteredRequests.forEach((req, index) => {
        const dateStr = new Date(req.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const fieldStr = getFieldLabel(req.fieldName);
        const oldValStr = req.oldValue || 'Kosong';
        const newValStr = req.newValue;
        const statusStr = t(`claims.statuses.${req.status}`) || req.status;
        const deptStr = req.employee.department?.name || 'Umum';
        
        tableRows.push([
          index + 1,
          req.employee.name,
          req.employee.employeeCode,
          deptStr,
          fieldStr,
          oldValStr,
          newValStr,
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
          8: { halign: 'center' }
        }
      });
      
      doc.save(`ESS_Correction_Log_${statusFilter}_${new Date().toISOString().slice(0,10)}.pdf`);
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
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">{t('profileRequests.title')}</h1>
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mt-1">{t('profileRequests.subtitle')}</p>
        </div>
        <button 
          onClick={exportToPDF}
          disabled={filteredRequests.length === 0}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:opacity-70 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer self-start md:self-auto shrink-0"
        >
          <FileText className="w-4 h-4" />
          Ekspor PDF Log
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
              {statusVal === 'All' ? t('profileRequests.allRequests') : t(`claims.statuses.${statusVal}`)}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('profileRequests.searchPlaceholder')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700 placeholder:text-slate-400 font-medium"
          />
        </div>
      </div>

      {/* Requests List */}
      {isLoading ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-sm flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 shadow-sm text-center space-y-3">
          <User className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-500">{t('profileRequests.noRequests')}</p>
          <p className="text-xs text-slate-400">{t('profileRequests.noRequestsDesc')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-[10px] font-extrabold uppercase tracking-wider bg-slate-50/70">
                  <th className="py-4 px-6">{t('profileRequests.table.employee')}</th>
                  <th className="py-4 px-6">{t('profileRequests.table.fieldName')}</th>
                  <th className="py-4 px-6">{t('profileRequests.table.oldValue')}</th>
                  <th className="py-4 px-6">{t('profileRequests.table.newValue')}</th>
                  <th className="py-4 px-6">{t('profileRequests.table.document')}</th>
                  <th className="py-4 px-6 text-right">{t('profileRequests.table.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map(req => (
                  <tr key={req.id} className="hover:bg-slate-50/50 text-sm text-slate-700 transition-all">
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-800">{req.employee.name}</div>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{req.employee.employeeCode} • {req.employee.department?.name || 'Umum'}</div>
                    </td>
                    <td className="py-4 px-6 font-bold text-blue-600">
                      {getFieldLabel(req.fieldName)}
                    </td>
                    <td className="py-4 px-6 text-slate-500 font-medium italic">
                      {req.oldValue || 'Kosong'}
                    </td>
                    <td className="py-4 px-6 font-bold text-slate-800">
                      {req.newValue}
                    </td>
                    <td className="py-4 px-6">
                      {req.documentUrl ? (
                        <button 
                          onClick={() => setPreviewFile(getFileUrl(req.documentUrl))}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-all"
                        >
                          <FileText className="w-3.5 h-3.5" /> {t('profileRequests.viewAttachment')}
                        </button>
                      ) : (
                        <span className="text-slate-400 text-xs italic">{t('profileRequests.noAttachment')}</span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {req.status === 'PENDING' ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleApprove(req.id)}
                            className="inline-flex items-center justify-center p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg text-xs font-bold transition-all"
                            title={t('profileRequests.approve')}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleReject(req.id)}
                            className="inline-flex items-center justify-center p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-all"
                            title={t('profileRequests.reject')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[req.status]}`}>
                          {t(`claims.statuses.${req.status}`)}
                        </span>
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
      {activeRequestId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setActiveRequestId(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-base">
                {reviewAction === 'APPROVE' ? t('profileRequests.approveTitle') : t('profileRequests.rejectTitle')}
              </h3>
              <button onClick={() => setActiveRequestId(null)} className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center border border-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500 font-medium">
                {reviewAction === 'APPROVE' ? t('profileRequests.approveHelp') : t('profileRequests.rejectHelp')}
              </p>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {t('profileRequests.noteLabel')} {reviewAction === 'REJECT' && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  placeholder={reviewAction === 'APPROVE' ? t('profileRequests.noteLabel') : t('profileRequests.noteLabel')}
                  value={reviewNote}
                  onChange={e => setReviewNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 text-slate-700 min-h-[100px]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button 
                onClick={() => setActiveRequestId(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 font-bold text-xs hover:bg-slate-50 transition-all uppercase tracking-wider"
              >
                {t('profileRequests.cancel')}
              </button>
              <button 
                onClick={submitReview}
                disabled={handleReviewMutation.isPending || (reviewAction === 'REJECT' && !reviewNote.trim())}
                className={`px-4 py-2 rounded-lg text-white font-bold text-xs uppercase tracking-wider transition-all shadow-sm active:scale-95 disabled:opacity-50 ${
                  reviewAction === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-100'
                }`}
              >
                {handleReviewMutation.isPending ? t('profileRequests.processing') : reviewAction === 'APPROVE' ? t('profileRequests.approve') : t('profileRequests.reject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Viewer Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
          <div className="absolute inset-0 cursor-zoom-out" onClick={() => setPreviewFile(null)} />
          <div className="relative max-w-4xl max-h-[85vh] w-full bg-white rounded-2xl overflow-hidden p-2 flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <button 
              onClick={() => setPreviewFile(null)} 
              className="absolute top-4 right-4 w-9 h-9 bg-black/60 text-white rounded-xl flex items-center justify-center hover:bg-black/80 transition-all z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-slate-100 rounded-xl">
              {previewFile.toLowerCase().endsWith('.pdf') ? (
                <iframe src={previewFile} title="pdf-viewer" className="w-full h-[70vh] border-0 rounded-lg" />
              ) : (
                <img src={previewFile} alt="proof-preview" className="max-w-full max-h-[75vh] object-contain rounded-lg" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminProfileRequests;
