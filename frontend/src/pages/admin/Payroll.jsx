import React, { useState, useEffect } from 'react';
import { 
  Banknote, Download, FileText, CheckCircle, XCircle, Search, Calendar, ChevronDown, Filter 
} from 'lucide-react';
import { payrollAPI } from '../../services/api';

const Payroll = () => {
  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedPayroll, setSelectedPayroll] = useState(null);

  useEffect(() => {
    fetchPayrolls();
  }, []);

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
    if (!selectedPeriod) return alert('Pilih periode (YYYY-MM)');
    setLoading(true);
    try {
      await payrollAPI.generate({ period: selectedPeriod });
      alert('Payroll berhasil di-generate!');
      setGenerateModalOpen(false);
      fetchPayrolls();
    } catch (err) {
      alert('Gagal generate: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (id) => {
    try {
      const { data, filename } = await payrollAPI.exportExcel(id);
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Gagal export data');
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Banknote className="text-blue-600" />
            Payroll Management
          </h1>
          <p className="text-gray-500 mt-1">Kelola dan generate gaji bulanan karyawan</p>
        </div>
        <button 
          onClick={() => setGenerateModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg flex items-center font-medium shadow-sm transition-all"
        >
          <Calendar className="w-5 h-5 mr-2" />
          Generate Payroll
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">Total Payroll</div>
          <div className="text-2xl font-bold text-gray-800">{payrolls.length}</div>
          <div className="text-xs text-green-600 mt-2 font-medium flex items-center">
            Periode Tercatat
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">Awaiting Approval</div>
          <div className="text-2xl font-bold text-yellow-600">
            {payrolls.filter(p => p.status === 'AWAITING_APPROVAL').length}
          </div>
          <div className="text-xs text-gray-500 mt-2 font-medium">Butuh Persetujuan</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm md:col-span-2">
          <div className="text-sm font-medium text-gray-500 mb-1">Latest Total Net Pay</div>
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
              <th className="px-6 py-4 font-medium text-gray-600">Periode</th>
              <th className="px-6 py-4 font-medium text-gray-600">Karyawan</th>
              <th className="px-6 py-4 font-medium text-gray-600">Total Net (Rp)</th>
              <th className="px-6 py-4 font-medium text-gray-600">Status</th>
              <th className="px-6 py-4 font-medium text-gray-600 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payrolls.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-800">{p.periodName}</td>
                <td className="px-6 py-4 text-gray-600">{p.totalEmployees} Orang</td>
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
                  <button 
                    onClick={() => loadDetail(p.id)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="View Detail"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleExport(p.id)}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                    title="Export Excel"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </td>
              </tr>
            ))}
            {payrolls.length === 0 && !loading && (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                  Belum ada data payroll
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Generate Modal */}
      {generateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Generate Payroll</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Pilih Periode</label>
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
                Batal
              </button>
              <button 
                onClick={handleGenerate}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Generate Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Detail Modal (Simplified for UI display) */}
      {selectedPayroll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Detail Payroll: {selectedPayroll.periodName}</h2>
                <p className="text-sm text-gray-500 mt-1">Status: {selectedPayroll.status}</p>
              </div>
              <button onClick={() => setSelectedPayroll(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <XCircle className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            <div className="p-6 overflow-auto flex-1">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 sticky top-0">
                  <tr>
                    <th className="p-3 text-left">Karyawan</th>
                    <th className="p-3 text-left">Dept</th>
                    <th className="p-3 text-right">Gaji Pokok</th>
                    <th className="p-3 text-right">Kehadiran</th>
                    <th className="p-3 text-right">Lembur</th>
                    <th className="p-3 text-right">Potongan</th>
                    <th className="p-3 text-right font-bold">Net Pay</th>
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
                        <div>Hadir: {d.daysPresent}</div>
                        <div className="text-red-500 text-xs">Telat: {d.totalLateMinutes}m</div>
                      </td>
                      <td className="p-3 text-right">Rp {d.overtimePay.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-right text-red-600">Rp {d.totalDeduction.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-right font-bold text-blue-600">Rp {d.netPay.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payroll;
