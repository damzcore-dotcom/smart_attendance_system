import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Banknote, Download, FileText, CheckCircle, XCircle, Search, Calendar, ChevronDown, Filter, Printer 
} from 'lucide-react';
import { payrollAPI, settingsAPI, attendanceAPI } from '../../services/api';
import PrintableSlip from '../../components/payroll/PrintableSlip';

const Payroll = () => {
  const { t, i18n } = useTranslation();
  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedPayroll, setSelectedPayroll] = useState(null);
  const [printDetail, setPrintDetail] = useState(null);
  const [companySettings, setCompanySettings] = useState({});
  const [slipConfig, setSlipConfig] = useState(null);

  useEffect(() => {
    fetchPayrolls();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await settingsAPI.getAll();
      setCompanySettings(res.data);
      if (res.data.slipConfig) {
        setSlipConfig(JSON.parse(res.data.slipConfig));
      } else {
        setSlipConfig({
          themeStyle: 'modern', showCompanyLogo: true, showAttendanceStats: true,
          hideZeroAllowances: true, showOvertimeDetails: true,
          watermarkText: 'CONFIDENTIAL', footerNote: 'Dokumen ini rahasia.'
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPayrolls = async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getAll();
      setPayrolls(res.data);
    } catch (err) {
      console.error('Failed to fetch payrolls', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedPeriod) return alert(t('payroll.selectPeriodAlert'));
    setLoading(true);
    try {
      await payrollAPI.generate({ period: selectedPeriod });
      alert(t('payroll.generateSuccess'));
      setGenerateModalOpen(false);
      fetchPayrolls();
    } catch (err) {
      alert(t('payroll.generateFailed', { message: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (id) => {
    try {
      const { data, filename } = await payrollAPI.exportExcel(id, i18n.language || 'id');
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert(t('payroll.exportFailed'));
    }
  };

  const handleSubmitForApproval = async (id) => {
    if (!window.confirm(t('payroll.confirmApproval'))) return;
    try {
      await payrollAPI.submitForApproval(id);
      alert(t('payroll.submitApprovalSuccess'));
      fetchPayrolls();
    } catch (err) {
      alert(t('payroll.submitApprovalFailed', { message: err.message }));
    }
  };

  const handleFinalize = async (id) => {
    if (!window.confirm(t('payroll.confirmFinalize'))) return;
    try {
      await payrollAPI.finalize(id);
      alert(t('payroll.finalizeSuccess'));
      fetchPayrolls();
    } catch (err) {
      alert(t('payroll.finalizeFailed', { message: err.message }));
    }
  };

  const loadDetail = async (id) => {
    try {
      const res = await payrollAPI.getById(id);
      setSelectedPayroll(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handlePrint = (detail) => {
    setPrintDetail(detail);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="print:hidden space-y-6">
        <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Banknote className="text-blue-600" />
            {t('payroll.title')}
          </h1>
          <p className="text-gray-500 mt-1">{t('payroll.subtitle')}</p>
        </div>
        <button 
          onClick={() => setGenerateModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg flex items-center font-medium shadow-sm transition-all"
        >
          <Calendar className="w-5 h-5 mr-2" />
          {t('payroll.generatePayrollBtn')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">{t('payroll.totalPayroll')}</div>
          <div className="text-2xl font-bold text-gray-800">{payrolls.length}</div>
          <div className="text-xs text-green-600 mt-2 font-medium flex items-center">
            {t('payroll.recordedPeriods')}
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">{t('payroll.awaitingApproval')}</div>
          <div className="text-2xl font-bold text-yellow-600">
            {payrolls.filter(p => p.status === 'PENDING_APPROVAL').length}
          </div>
          <div className="text-xs text-gray-500 mt-2 font-medium">{t('payroll.needsApproval')}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm md:col-span-2">
          <div className="text-sm font-medium text-gray-500 mb-1">{t('payroll.latestNetPay')}</div>
          <div className="text-2xl font-bold text-blue-600">
            Rp {payrolls[0]?.totalNet.toLocaleString('id-ID') || 0}
          </div>
          <div className="text-xs text-gray-500 mt-2 font-medium">Periode: {payrolls[0]?.periodName || '-'}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 font-medium text-gray-600">{t('payroll.periodLabel')}</th>
              <th className="px-6 py-4 font-medium text-gray-600">{t('payroll.employeesLabel')}</th>
              <th className="px-6 py-4 font-medium text-gray-600">{t('payroll.totalNetLabel')}</th>
              <th className="px-6 py-4 font-medium text-gray-600">{t('payroll.statusLabel')}</th>
              <th className="px-6 py-4 font-medium text-gray-600 text-right">{t('payroll.actionLabel')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payrolls.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-800">{p.periodName}</td>
                <td className="px-6 py-4 text-gray-600">{t('payroll.employeesCount', { count: p.totalEmployees })}</td>
                <td className="px-6 py-4 font-semibold text-gray-800">
                  {p.totalNet.toLocaleString('id-ID')}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    p.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' :
                    p.status === 'DRAFT' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                    p.status === 'APPROVED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-yellow-50 text-yellow-700 border-yellow-200'
                  }`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-6 py-4 flex justify-end gap-2">
                  {p.status === 'DRAFT' && (
                    <button 
                      onClick={() => handleSubmitForApproval(p.id)}
                      className="px-3 py-1.5 text-xs font-semibold bg-yellow-100 text-yellow-700 hover:bg-yellow-200 rounded-lg transition-colors flex items-center gap-1"
                    >
                      {t('payroll.submitApprovalBtn')}
                    </button>
                  )}
                  {p.status === 'APPROVED' && (
                    <button 
                      onClick={() => handleFinalize(p.id)}
                      className="px-3 py-1.5 text-xs font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors flex items-center gap-1"
                    >
                      {t('payroll.finalizeBtn')}
                    </button>
                  )}
                  <button 
                    onClick={() => loadDetail(p.id)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title={t('payroll.viewDetailBtn')}
                  >
                    <Search className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleExport(p.id)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title={t('payroll.exportExcelBtn')}
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
            {payrolls.length === 0 && !loading && (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                  {t('payroll.noData')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Generate Modal */}
      {generateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 print:hidden">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{t('payroll.generatePayrollBtn')}</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('payroll.selectPeriod')}</label>
              <input 
                type="month" 
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none" 
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setGenerateModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button 
                onClick={handleGenerate}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? t('payroll.processing') : t('payroll.generateNow')}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Detail Modal (Simplified for UI display) */}
      {selectedPayroll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">{t('payroll.detailTitle', { period: selectedPayroll.periodName })}</h2>
                <p className="text-sm text-gray-500 mt-1">{t('payroll.statusLabel')}: {selectedPayroll.status}</p>
              </div>
              <button onClick={() => setSelectedPayroll(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <XCircle className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 sticky top-0">
                  <tr>
                    <th className="p-3 text-left">{t('payroll.employeesLabel')}</th>
                    <th className="p-3 text-left">{t('payroll.detailDept')}</th>
                    <th className="p-3 text-right">{t('payroll.detailBaseSalary')}</th>
                    <th className="p-3 text-right">{t('payroll.detailAttendance')}</th>
                    <th className="p-3 text-right">{t('payroll.detailOvertime')}</th>
                    <th className="p-3 text-right">{t('payroll.detailDeductions')}</th>
                    <th className="p-3 text-right font-bold">{t('payroll.detailNetPay')}</th>
                    <th className="p-3 text-center">{t('payroll.printSlip')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedPayroll.details?.map(d => (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-medium text-gray-800">{d.employeeName}</div>
                        <div className="text-xs text-gray-500">{d.employeeCode} | {d.employmentType}</div>
                      </td>
                      <td className="p-3">{d.department}</td>
                      <td className="p-3 text-right">Rp {d.baseSalary.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-right">
                        <div>{t('payroll.detailDaysPresent', { days: d.daysPresent })}</div>
                        <div className="text-red-500 text-xs">{t('payroll.detailLateMinutes', { mins: d.totalLateMinutes })}</div>
                      </td>
                      <td className="p-3 text-right">Rp {d.overtimePay.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-right text-red-600">Rp {d.totalDeduction.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-right font-bold text-blue-600">Rp {d.netPay.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handlePrint(d)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title={t('payroll.printSlip')}
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Hidden Print Container for Slip */}
      {printDetail && (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999]">
          <PrintableSlip 
            detail={printDetail} 
            company={companySettings} 
            config={slipConfig} 
          />
        </div>
      )}
    </div>
  );
};

export default Payroll;
