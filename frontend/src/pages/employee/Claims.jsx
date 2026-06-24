import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { claimAPI, getFileUrl } from '../../services/api';
import { 
  Plus, Receipt, ArrowLeft, Loader2, Calendar, FileText, X, Upload, Coins
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const CATEGORY_COLORS = {
  MEDICAL: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  TRAVEL: 'bg-blue-50 text-blue-700 border-blue-100',
  MEAL: 'bg-amber-50 text-amber-700 border-amber-100',
  OPERATIONAL: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  OTHER: 'bg-slate-50 text-slate-700 border-slate-100'
};

const STATUS_COLORS = {
  PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200'
};

const Claims = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('MEDICAL');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['myClaims'],
    queryFn: () => claimAPI.getAll()
  });

  const claims = data?.data || [];

  const exportToPDF = () => {
    try {
      const doc = new jsPDF();
      
      // Page title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('Smart HRIS Platform', 14, 20);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text(t('claims.pdfReportTitle', 'Laporan Riwayat Klaim Reimbursement'), 14, 28);
      doc.setFontSize(10);
      doc.text(`${t('claims.pdfPrintedAt', 'Dicetak pada')}: ${new Date().toLocaleString(i18n.language || 'id-ID')}`, 14, 34);
      
      const tableColumn = [
        t('claims.pdfColNo', 'No'), 
        t('common.date', 'Tanggal'), 
        t('claims.pdfColTitle', 'Judul Klaim'), 
        t('claims.pdfColCategory', 'Kategori'), 
        t('claims.pdfColAmount', 'Nominal'), 
        t('common.status', 'Status'), 
        t('claims.pdfColNote', 'Catatan')
      ];
      const tableRows = [];
      
      claims.forEach((claim, index) => {
        const dateStr = new Date(claim.createdAt).toLocaleDateString(i18n.language || 'id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
        const amountStr = `Rp ${claim.amount.toLocaleString(i18n.language || 'id-ID')}`;
        const categoryStr = t(`claims.categories.${claim.category}`) || claim.category;
        const statusStr = t(`claims.statuses.${claim.status}`) || claim.status;
        const noteStr = claim.reviewNote || '-';
        
        tableRows.push([
          index + 1,
          dateStr,
          claim.title,
          categoryStr,
          amountStr,
          statusStr,
          noteStr
        ]);
      });
      
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 40,
        styles: { fontSize: 9, font: 'helvetica' },
        headStyles: { fillColor: [37, 99, 235], halign: 'center' }, // Royal Blue
        columnStyles: {
          4: { halign: 'right' },
          5: { halign: 'center' }
        }
      });
      
      doc.save(`Riwayat_Klaim_${new Date().toISOString().slice(0,10)}.pdf`);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      alert(t('claims.pdfExportError', 'Gagal mengekspor PDF. Pastikan data termuat dengan benar.'));
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !amount || !file) {
      return alert(t('common.required'));
    }
    setIsSubmitting(true);
    try {
      const res = await claimAPI.create(title, category, parseFloat(amount), file);
      if (res.success) {
        alert(t('common.success'));
        setTitle('');
        setAmount('');
        setFile(null);
        setFilePreview(null);
        setIsModalOpen(false);
        queryClient.invalidateQueries(['myClaims']);
      }
    } catch (err) {
      alert(err.message || t('common.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate('/employee/profile')}
            className="w-10 h-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-slate-700 transition-all hover:bg-slate-50 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-800">{t('claims.title')}</h2>
            <p className="text-xs text-slate-400">{t('claims.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={exportToPDF}
            disabled={claims.length === 0}
            className="bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 disabled:opacity-50 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            PDF
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" />
            {t('claims.newClaim')}
          </button>
        </div>
      </div>

      {/* Claims List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
      ) : claims.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <Receipt className="w-12 h-12 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-500">{t('claims.noClaims')}</p>
          <p className="text-xs text-slate-400">{t('claims.noClaimsDesc')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {claims.map(claim => (
            <div key={claim.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 hover:border-blue-200 transition-all">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${CATEGORY_COLORS[claim.category] || 'bg-slate-50 text-slate-700'}`}>
                    {t(`claims.categories.${claim.category}`)}
                  </span>
                  <h4 className="font-bold text-slate-800 text-base mt-2">{claim.title}</h4>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(claim.createdAt).toLocaleDateString(t('common.date') === 'Tanggal' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_COLORS[claim.status]}`}>
                  {t(`claims.statuses.${claim.status}`)}
                </span>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{t('claims.claimAmount')}</p>
                  <p className="text-lg font-extrabold text-blue-600">Rp {claim.amount.toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  <a 
                    href={getFileUrl(claim.receiptUrl)} 
                    target="_blank" 
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all"
                  >
                    {t('claims.receipt')}
                  </a>
                </div>
              </div>

              {claim.reviewNote && (
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-600">
                  <span className="font-semibold text-slate-700 block mb-0.5">{t('claims.reviewerNote')}</span>
                  {claim.reviewNote}
                </div>
              )}

              {claim.payroll && (
                <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl p-3 text-xs flex items-center gap-2">
                  <Coins className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>{t('claims.paidPeriod')} <strong>{claim.payroll.periodName}</strong></span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload Claim Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative bg-white border-t border-slate-200 rounded-t-3xl p-6 space-y-4 animate-in slide-in-from-bottom-20 duration-500 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-2" onClick={() => setIsModalOpen(false)} />
            <div className="flex justify-between items-center mb-2">
              <div>
                <h3 className="text-lg font-bold text-slate-800">{t('claims.submitNewClaim')}</h3>
                <p className="text-xs text-slate-400">{t('claims.fillDetails')}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-9 h-9 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-all border border-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">{t('claims.category')}</label>
                <select 
                  value={category} 
                  onChange={e => setCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-semibold"
                >
                  <option value="MEDICAL">{t('claims.categories.MEDICAL')}</option>
                  <option value="TRAVEL">{t('claims.categories.TRAVEL')}</option>
                  <option value="MEAL">{t('claims.categories.MEAL')}</option>
                  <option value="OPERATIONAL">{t('claims.categories.OPERATIONAL')}</option>
                  <option value="OTHER">{t('claims.categories.OTHER')}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">{t('claims.description')}</label>
                <input 
                  type="text" 
                  placeholder={t('claims.description')} 
                  value={title} 
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-medium"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1">{t('claims.amountRupiah')}</label>
                <input 
                  type="number" 
                  placeholder="e.g. 150000" 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 font-bold text-blue-600"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block ml-1 font-semibold">{t('claims.proofPayment')}</label>
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50/50 hover:bg-slate-50 transition-all relative">
                  <input 
                    type="file" 
                    accept=".pdf,.png,.jpg,.jpeg" 
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    required
                  />
                  {filePreview ? (
                    <div className="space-y-2">
                      {file.type.startsWith('image/') ? (
                        <img src={filePreview} alt="receipt-preview" className="max-h-32 mx-auto rounded-lg object-contain shadow-sm border border-slate-200" />
                      ) : (
                        <FileText className="w-10 h-10 text-blue-500 mx-auto" />
                      )}
                      <p className="text-xs text-slate-500 font-semibold truncate">{file.name}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 py-2">
                      <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('claims.chooseFile')}</p>
                      <p className="text-[10px] text-slate-400">{t('claims.fileHelp')}</p>
                    </div>
                  )}
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isSubmitting || !title || !amount || !file}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:opacity-70 text-white py-3.5 rounded-xl text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 mt-4"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                {t('claims.submitReimbursement')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Claims;
