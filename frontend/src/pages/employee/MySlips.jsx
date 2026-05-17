import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authAPI, payrollAPI, settingsAPI, attendanceAPI } from '../../services/api';
import { Banknote, Printer, ChevronLeft, Loader2, Calendar, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PrintableSlip from '../../components/payroll/PrintableSlip';
import PrintableAttendanceReport from '../../components/payroll/PrintableAttendanceReport';

const MySlips = () => {
  const navigate = useNavigate();
  const [printDetail, setPrintDetail] = useState(null);
  const [printReport, setPrintReport] = useState(null);
  const [printLogs, setPrintLogs] = useState([]);
  const [companySettings, setCompanySettings] = useState({});
  const [slipConfig, setSlipConfig] = useState(null);
  const [attendanceReportConfig, setAttendanceReportConfig] = useState(null);

  const { data: userData } = useQuery({
    queryKey: ['me'],
    queryFn: () => authAPI.getMe(),
  });

  const employeeId = userData?.user?.employee?.id || authAPI.getStoredUser()?.employee?.id;

  const { data: slipsData, isLoading: slipsLoading } = useQuery({
    queryKey: ['my-slips', employeeId],
    queryFn: () => payrollAPI.getMySlips(employeeId),
    enabled: !!employeeId,
  });

  useEffect(() => {
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
        
        if (res.data.attendanceReportConfig) {
          setAttendanceReportConfig(JSON.parse(res.data.attendanceReportConfig));
        } else {
          setAttendanceReportConfig({
            themeStyle: 'modern', showCompanyLogo: true, showLatePenalty: true, showDailyLogs: true,
            watermarkText: 'CONFIDENTIAL', footerNote: 'Dokumen ini otomatis di-generate oleh sistem.'
          });
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchSettings();
  }, []);

  const handlePrint = (slip) => {
    setPrintDetail(slip);
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const handlePrintReport = async (slip) => {
    try {
      const periodParts = slip.payroll?.periodName?.split(' ');
      const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
      const monthIdx = monthNames.indexOf(periodParts?.[0]?.toUpperCase());
      const year = parseInt(periodParts?.[1]);
      
      let logs = [];
      if (monthIdx !== -1 && year) {
        const startDate = new Date(year, monthIdx, 1).toISOString().split('T')[0];
        const endDate = new Date(year, monthIdx + 1, 0).toISOString().split('T')[0];
        const res = await attendanceAPI.getHistory(slip.employeeId, { startDate, endDate });
        logs = res.data;
      }
      
      setPrintLogs(logs);
      setPrintReport(slip);
      
      setTimeout(() => {
        window.print();
      }, 500);
    } catch (err) {
      console.error(err);
      alert('Gagal mengambil rincian absensi');
    }
  };

  const slips = slipsData?.data || [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-5 duration-500 pb-20 print:hidden">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center justify-between border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="w-10 h-10 flex items-center justify-center bg-slate-50 text-slate-600 rounded-xl border border-slate-200 active:scale-95 transition-all">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Slip Gaji Saya</h1>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Riwayat Penggajian</p>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {slipsLoading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : slips.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-sm mt-4">
            <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
              <Banknote className="w-8 h-8" />
            </div>
            <p className="text-sm font-semibold text-slate-600">Belum Ada Slip Gaji</p>
            <p className="text-[10px] text-slate-400 mt-1">Slip gaji akan muncul di sini setelah disetujui HRD.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {slips.map((slip) => (
              <div key={slip.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800">{slip.payroll?.periodName}</h3>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Periode</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <h3 className="font-bold text-blue-600 text-lg">Rp {slip.netPay?.toLocaleString('id-ID')}</h3>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase">Total Diterima</p>
                  </div>
                </div>
                
                <div className="p-4 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-slate-500 mb-0.5">Gaji Pokok</p>
                    <p className="font-bold text-slate-800">Rp {slip.baseSalary?.toLocaleString('id-ID')}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 mb-0.5">Total Potongan</p>
                    <p className="font-bold text-red-500">-Rp {slip.totalDeduction?.toLocaleString('id-ID')}</p>
                  </div>
                </div>

                <div className="p-4 border-t border-slate-100 bg-white grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => handlePrint(slip)}
                    className="w-full py-2.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-blue-100 hover:border-blue-600 active:scale-[0.98]"
                  >
                    <Printer className="w-4 h-4" /> CETAK SLIP
                  </button>
                  <button 
                    onClick={() => handlePrintReport(slip)}
                    className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors border border-emerald-100 hover:border-emerald-600 active:scale-[0.98]"
                  >
                    <FileText className="w-4 h-4" /> CETAK ABSENSI
                  </button>
                </div>
              </div>
            ))}
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

      {/* Hidden Print Container for Attendance Report */}
      {printReport && (
        <div className="hidden print:block fixed inset-0 bg-white z-[9999]">
          <PrintableAttendanceReport 
            detail={printReport} 
            logs={printLogs}
            company={companySettings} 
            config={attendanceReportConfig || slipConfig} 
          />
        </div>
      )}
    </div>
  );
};

export default MySlips;
