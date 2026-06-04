import React, { useState, useEffect } from 'react';
import { Banknote, CheckCircle, XCircle, Search, Calendar, ChevronDown, Download } from 'lucide-react';
import { payrollAPI } from '../../services/api';
import { useTranslation } from 'react-i18next';

const DirectorPayroll = () => {
  const { i18n } = useTranslation();
  const [payrolls, setPayrolls] = useState([]);
  const [loading, setLoading] = useState(false);
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

  const loadDetail = async (id) => {
    try {
      const res = await payrollAPI.getById(id);
      setSelectedPayroll(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleApprove = async (id) => {
    if (!window.confirm('Approve this draft payroll?')) return;
    try {
      await payrollAPI.approve(id);
      alert('Payroll successfully approved.');
      fetchPayrolls();
    } catch (err) {
      alert('Failed to approve: ' + err.message);
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt('Reason for rejection:');
    if (reason === null) return;
    try {
      await payrollAPI.reject(id, { note: reason });
      alert('Payroll rejected.');
      fetchPayrolls();
    } catch (err) {
      alert('Failed to reject: ' + err.message);
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
      alert('Failed to export data');
    }
  };

  const pendingPayrolls = payrolls.filter(p => p.status === 'PENDING_APPROVAL');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Banknote className="text-blue-600" />
            Payroll Approval
          </h1>
          <p className="text-gray-500 mt-1">Review and approve draft monthly payroll for employees</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
          <div className="text-sm font-medium text-gray-500 mb-1">Awaiting Approval</div>
          <div className="text-2xl font-bold text-yellow-600">{pendingPayrolls.length}</div>
          <div className="text-xs text-yellow-600 mt-2 font-medium">Awaiting Approval</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm md:col-span-2">
          <div className="text-sm font-medium text-gray-500 mb-1">Total Payroll</div>
          <div className="text-2xl font-bold text-gray-800">{payrolls.length}</div>
          <div className="text-xs text-gray-500 mt-2 font-medium">All Periods</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 font-medium text-gray-600">Period</th>
              <th className="px-6 py-4 font-medium text-gray-600">Employees</th>
              <th className="px-6 py-4 font-medium text-gray-600">Total Net (Rp)</th>
              <th className="px-6 py-4 font-medium text-gray-600">Status</th>
              <th className="px-6 py-4 font-medium text-gray-600 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {payrolls.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-800">{p.periodName}</td>
                <td className="px-6 py-4 text-gray-600">{p.totalEmployees} Employees</td>
                <td className="px-6 py-4 font-semibold text-gray-800">
                  {p.totalNet.toLocaleString('id-ID')}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                    p.status === 'COMPLETED' ? 'bg-green-50 text-green-700 border-green-200' :
                    p.status === 'DRAFT' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                    p.status === 'APPROVED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    p.status === 'REJECTED' ? 'bg-red-50 text-red-700 border-red-200' :
                    'bg-yellow-50 text-yellow-700 border-yellow-200'
                  }`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-6 py-4 flex justify-end gap-2">
                  {p.status === 'PENDING_APPROVAL' && (
                    <>
                      <button 
                        onClick={() => handleApprove(p.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Approve"
                      >
                        <CheckCircle className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={() => handleReject(p.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Reject"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </>
                  )}
                  <button 
                    onClick={() => loadDetail(p.id)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="View Detail"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={() => handleExport(p.id)}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
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
                  No payroll data available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedPayroll && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white rounded-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Payroll Details: {selectedPayroll.periodName}</h2>
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
                    <th className="p-3 text-left">Employee</th>
                    <th className="p-3 text-left">Dept</th>
                    <th className="p-3 text-right">Base Salary</th>
                    <th className="p-3 text-right">Attendance</th>
                    <th className="p-3 text-right">Overtime</th>
                    <th className="p-3 text-right">Deduction</th>
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
                        <div>Present: {d.daysPresent}</div>
                        <div className="text-red-500 text-xs">Late: {d.totalLateMinutes}m</div>
                      </td>
                      <td className="p-3 text-right">Rp {d.overtimePay.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-right text-red-600">Rp {d.totalDeduction.toLocaleString('id-ID')}</td>
                      <td className="p-3 text-right font-bold text-blue-600">Rp {d.netPay.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedPayroll.status === 'PENDING_APPROVAL' && (
              <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                <button 
                  onClick={() => { setSelectedPayroll(null); handleReject(selectedPayroll.id); }}
                  className="px-6 py-2.5 bg-red-100 text-red-700 hover:bg-red-200 font-semibold rounded-lg"
                >
                  Reject
                </button>
                <button 
                  onClick={() => { setSelectedPayroll(null); handleApprove(selectedPayroll.id); }}
                  className="px-6 py-2.5 bg-green-600 text-white hover:bg-green-700 font-semibold rounded-lg"
                >
                  Approve Payroll
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DirectorPayroll;
