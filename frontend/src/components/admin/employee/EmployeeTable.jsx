import { useTranslation } from 'react-i18next';
import { 
  ChevronUp, ChevronDown, Loader2, Printer, Trash2, Fingerprint, ScanFace, Clock, ChevronRight 
} from 'lucide-react';
import { getFileUrl } from '../../../services/api';

const EmployeeTable = ({
  isReadOnly = false,
  isLoading,
  filteredEmployees = [],
  sortConfig,
  handleSort,
  handleEditEmployee,
  setPrintIDCardEmp,
  handleDeleteEmployee,
  deleteMutationPending = false,
  page,
  totalPages,
  totalEmployees,
  setPage
}) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-auto min-h-[400px] max-h-[65vh]">
        <table className="w-full text-left whitespace-nowrap min-w-[2800px] border-separate border-spacing-0">
          <thead className="sticky top-0 z-20 bg-slate-50">
            <tr>
              {!isReadOnly && (
                <th className="px-6 py-4 sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('employees.table.actions')}</span>
                </th>
              )}
              <th 
                className={`px-6 py-4 sticky ${isReadOnly ? 'left-0' : 'left-[120px]'} z-30 bg-slate-50 border-b border-r border-slate-200 text-center cursor-pointer hover:bg-slate-100 transition-colors group`}
                onClick={() => handleSort('employeeCode')}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('employees.table.nik')}</span>
                  {sortConfig.key === 'employeeCode' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center block">{t('employees.table.fingerprint')}</span>
              </th>
              <th 
                className={`px-6 py-4 sticky ${isReadOnly ? 'left-[130px]' : 'left-[250px]'} z-30 bg-slate-50 border-b border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] cursor-pointer hover:bg-slate-100 transition-colors group`}
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('employees.table.name')}</span>
                  {sortConfig.key === 'name' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center block">{t('employees.table.photo')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('employees.table.status')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('employees.table.leaveQuota')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('employees.table.faceDetect')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('employees.table.shift')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('employees.table.grade')}</span>
              </th>
              <th 
                className="px-6 py-4 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors group"
                onClick={() => handleSort('position')}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('common.position')}</span>
                  {sortConfig.key === 'position' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </th>
              <th 
                className="px-6 py-4 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors group"
                onClick={() => handleSort('section')}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('common.section')}</span>
                  {sortConfig.key === 'section' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </th>
              <th 
                className="px-6 py-4 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors group"
                onClick={() => handleSort('dept')}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('common.department')}</span>
                  {sortConfig.key === 'dept' ? (
                    sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-blue-600" /> : <ChevronDown className="w-3 h-3 text-blue-600" />
                  ) : (
                    <ChevronDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.empStatus')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.contract')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.joinDate')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.contractEnd')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.terminationDate')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.terminationReason')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.bpjsTk')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.bpjsKes')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.npwp')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.ptkp')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.maritalStatus')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.kkNumber')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.ktpNumber')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.birthDate')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.birthPlace')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.address')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.education')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.major')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.religion')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.phone')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider text-center block">{t('employees.table.children')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.fatherName')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.motherName')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.spouseName')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.emergencyContact')}</span>
              </th>
              <th className="px-6 py-4 border-b border-slate-200">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t('employees.table.notes')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={isReadOnly ? 38 : 39} className="text-center py-24">
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                    <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{t('employees.table.loadingData')}</p>
                  </div>
                </td>
              </tr>
            ) : filteredEmployees.length === 0 ? (
              <tr>
                <td colSpan={isReadOnly ? 38 : 39} className="text-center py-24">
                  <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Tidak ada data karyawan ditemukan</p>
                </td>
              </tr>
            ) : filteredEmployees.map((emp) => (
              <tr key={emp.dbId} className="group hover:bg-blue-50/50 transition-colors duration-200">
                {!isReadOnly && (
                  <td className="px-6 py-3 sticky left-0 z-10 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)]">
                    <div className="flex justify-center gap-2">
                      <button 
                        onClick={() => handleEditEmployee(emp)} 
                        className="px-4 py-1.5 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-blue-100 hover:border-blue-600 shadow-sm"
                      >
                        Ubah
                      </button>
                      <button 
                        onClick={() => {
                          setPrintIDCardEmp(emp);
                          setTimeout(() => {
                            window.print();
                            setTimeout(() => { setPrintIDCardEmp(null); }, 1000);
                          }, 500);
                        }} 
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-emerald-100 hover:border-emerald-600 shadow-sm flex items-center gap-1"
                        title="Cetak Kartu ID"
                      >
                        <Printer className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => handleDeleteEmployee(emp)} 
                        disabled={deleteMutationPending}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-rose-100 hover:border-rose-600 shadow-sm flex items-center gap-1 disabled:opacity-50"
                        title="Hapus Karyawan"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </td>
                )}
                <td className={`px-6 py-3 sticky ${isReadOnly ? 'left-0' : 'left-[120px]'} z-10 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 text-center text-xs font-semibold text-slate-700`}>
                  {emp.id}
                </td>
                <td className="px-6 py-3 border-r border-slate-100 text-center">
                  {emp.fingerPrintId ? (
                     <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200">
                       <Fingerprint className="w-3 h-3" /> {emp.fingerPrintId}
                     </span>
                  ) : (
                     <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md">-</span>
                  )}
                </td>
                <td className={`px-6 py-3 sticky ${isReadOnly ? 'left-[130px]' : 'left-[250px]'} z-10 bg-white group-hover:bg-blue-50/50 transition-colors border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.02)]`}>
                  <div className="flex flex-col min-w-[200px]">
                    <span className="text-sm font-bold text-slate-800 truncate">{emp.name || "Tidak Diketahui"}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{emp.email || "Tidak Ada Email"}</span>
                  </div>
                </td>
                <td className="px-6 py-3 text-center">
                  <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm overflow-hidden bg-slate-200 flex items-center justify-center mx-auto">
                    {(emp.profilePhoto || emp.facePhoto) ? (
                      <img src={getFileUrl(emp.profilePhoto || emp.facePhoto)} alt={emp.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xs font-bold text-slate-400">
                        {emp.name ? emp.name.charAt(0).toUpperCase() : '?'}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-3">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    emp.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                    emp.status === 'On Leave' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                    'bg-rose-50 text-rose-600 border-rose-200'
                  }`}>{emp.status === 'Active' ? t('employees.table.statusActive') : emp.status === 'On Leave' ? t('employees.table.statusOnLeave') : emp.status === 'Terminated' ? t('employees.table.statusTerminated') : emp.status || '-'}</span>
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                      <div 
                        className={`h-full rounded-full transition-all ${ (emp.remainingLeave ?? 0) <= 3 ? 'bg-rose-500' : 'bg-blue-500' }`} 
                        style={{ width: `${Math.min(100, ((emp.remainingLeave ?? 0) / (emp.leaveQuota ?? 12)) * 100)}%` }}
                      ></div>
                    </div>
                    <span className={`text-[10px] font-bold ${ (emp.remainingLeave ?? 0) <= 3 ? 'text-rose-600' : 'text-slate-600' }`}>
                      {emp.remainingLeave ?? 0}/{emp.leaveQuota ?? 12}
                    </span>
                  </div>
                </td>
                <td className="px-6 py-3">
                  <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-all ${emp.faceIdDisplay === 'Enrolled' ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                    {emp.faceIdDisplay === 'Enrolled' ? <ScanFace className="w-3 h-3"/> : <ScanFace className="w-3 h-3 opacity-50"/>}
                    {emp.faceIdDisplay === 'Enrolled' ? t('employees.table.registered') : emp.faceIdDisplay === 'Pending' ? t('employees.table.pending') : emp.faceIdDisplay || '-'}
                  </div>
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-700">{emp.shift?.name || 'Default'}</span>
                  </div>
                </td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.grade || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.position || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.section || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.dept || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.employmentStatus || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.contractDuration || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.joinDate ? new Date(emp.joinDate).toLocaleDateString() : '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.contractEnd ? new Date(emp.contractEnd).toLocaleDateString() : '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">
                  {emp.status === 'TERMINATED' && emp.terminationDate ? (
                    <span className="font-mono text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded">
                      {new Date(emp.terminationDate).toLocaleDateString()}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-6 py-3 text-xs text-slate-600">
                  {emp.status === 'TERMINATED' && emp.terminationReason ? (
                    <span className="text-rose-600 font-semibold bg-rose-50 px-2 py-0.5 rounded truncate max-w-[150px] inline-block">
                      {emp.terminationReason}
                    </span>
                  ) : '-'}
                </td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.bpjsTk || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.bpjsKesehatan || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.npwp || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.ptkpStatus || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.maritalStatus || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.kkNumber || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.idNumber || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.birthDate ? new Date(emp.birthDate).toLocaleDateString() : '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.birthPlace || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600 max-w-xs truncate">{emp.address || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.education || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.major || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.religion || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.phone || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600 text-center">{emp.numberOfChildren?.toString() || '0'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.fatherName || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.motherName || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.spouseName || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-600">{emp.emergencyContact || '-'}</td>
                <td className="px-6 py-3 text-xs text-slate-500 italic">{emp.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 3. Pagination */}
      <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium" dangerouslySetInnerHTML={{ __html: t('employees.table.showing', { count: totalEmployees, page, total: totalPages }) }} />
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-all"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 disabled:opacity-30 transition-all"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeTable;
