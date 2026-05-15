import React, { useState, useEffect } from 'react';
import { 
  Banknote, FileText, Clock, Users, Plus, Edit, Trash2, Save, X, AlertCircle, Settings2, LayoutGrid
} from 'lucide-react';
import { payrollAPI, settingsAPI } from '../../services/api';

const PayrollSettings = () => {
  const [activeTab, setActiveTab] = useState('components');
  const [loading, setLoading] = useState(false);
  const [components, setComponents] = useState([]);
  const [pkwtAlerts, setPkwtAlerts] = useState([]);
  const [overtimeRules, setOvertimeRules] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [config, setConfig] = useState({});
  const [globalSettings, setGlobalSettings] = useState({});
  const [matrixData, setMatrixData] = useState(null);

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab]);

  const fetchData = async (tab) => {
    setLoading(true);
    try {
      if (tab === 'components') {
        const res = await payrollAPI.getComponents();
        setComponents(res.data);
      } else if (tab === 'pkwt') {
        const res = await payrollAPI.getPkwtAlerts();
        setPkwtAlerts(res.data);
      } else if (tab === 'overtime') {
        const res = await payrollAPI.getOvertimeRules();
        setOvertimeRules(res.data);
      } else if (tab === 'assign') {
        const [empRes, compRes] = await Promise.all([
          payrollAPI.getEmployeeSalaries({ type: 'All', limit: 5000 }),
          payrollAPI.getComponents(),
        ]);
        setEmployees(empRes.data || []);
        setComponents(compRes.data || []);
      } else if (tab === 'matrix') {
        const res = await payrollAPI.getPositionAllowanceMatrix();
        setMatrixData(res.data);
      }
      
      const [confRes, settingsRes] = await Promise.all([
        payrollAPI.getConfig(),
        settingsAPI.getAll()
      ]);
      setConfig(confRes.data || {});
      setGlobalSettings(settingsRes.data || {});
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: 'components', label: 'Komponen Gaji', icon: Banknote },
    { id: 'matrix', label: 'Matriks Tunjangan', icon: LayoutGrid },
    { id: 'overtime', label: 'Aturan Lembur', icon: Clock },
    { id: 'assign', label: 'Assign Gaji', icon: Settings2 },
    { id: 'umk', label: 'Gaji UMK/UMR', icon: FileText },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Payroll Settings</h1>
          <p className="text-gray-600 text-sm mt-1">Konfigurasi komponen gaji, matriks tunjangan, lembur, dan assign gaji karyawan</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-white p-1 rounded-xl shadow-sm border border-gray-100 mb-6 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
                isActive 
                  ? 'bg-blue-50 text-blue-700 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon size={18} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        {loading ? (
          <div className="flex justify-center items-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {activeTab === 'components' && <ComponentsTab data={components} onRefresh={() => fetchData('components')} />}
            {activeTab === 'matrix' && <AllowanceMatrixTab data={matrixData} onRefresh={() => fetchData('matrix')} />}
            {activeTab === 'overtime' && <OvertimeTab data={overtimeRules} onRefresh={() => fetchData('overtime')} config={config} globalSettings={globalSettings} />}
            {activeTab === 'assign' && <AssignSalaryTab data={employees} components={components} onRefresh={() => fetchData('assign')} config={config} />}
            {activeTab === 'umk' && <UmkSettingsTab config={config} onRefresh={() => fetchData('umk')} />}
          </>
        )}
      </div>
    </div>
  );
};

const UmkSettingsTab = ({ config, onRefresh }) => {
  const [loading, setLoading] = useState(false);
  const [umkSalary, setUmkSalary] = useState(config.umkSalary || 0);

  const formatCurrency = (val) => new Intl.NumberFormat('id-ID').format(val || 0);
  const parseCurrency = (str) => parseInt(String(str).replace(/[^0-9]/g, '')) || 0;

  const handleSave = async () => {
    setLoading(true);
    try {
      await payrollAPI.updateConfig({ umkSalary: umkSalary.toString() });
      alert('Pengaturan UMK/UMR berhasil disimpan');
      onRefresh();
    } catch (err) {
      alert('Gagal menyimpan pengaturan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Pengaturan Gaji Normal (UMK/UMR)</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Besaran Gaji Pokok (Rp)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Rp.</span>
            <input 
              type="text" 
              value={formatCurrency(umkSalary)} 
              onChange={e => setUmkSalary(parseCurrency(e.target.value))} 
              className="w-full border rounded-lg pl-10 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-lg" 
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">Gaji pokok ini akan otomatis berlaku untuk semua karyawan yang memiliki tipe gaji "UMK / UMR".</p>
        </div>
        <button 
          onClick={handleSave} 
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Menyimpan...' : 'Simpan Gaji UMK/UMR'}
        </button>
      </div>
    </div>
  );
};

// ─── Sub Components ────────────────────────────────────────────────────────

const ComponentsTab = ({ data, onRefresh }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', type: 'ALLOWANCE', isFixed: true, defaultValue: 0, calculationType: 'FIXED_MONTHLY', isTaxable: false });

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ name: item.name, type: item.type, isFixed: item.isFixed, defaultValue: item.defaultValue, calculationType: item.calculationType || 'FIXED_MONTHLY', isTaxable: item.isTaxable || false });
    } else {
      setEditingItem(null);
      setFormData({ name: '', type: 'ALLOWANCE', isFixed: true, defaultValue: 0, calculationType: 'FIXED_MONTHLY', isTaxable: false });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingItem) {
        await payrollAPI.updateComponent(editingItem.id, formData);
      } else {
        await payrollAPI.createComponent(formData);
      }
      setModalOpen(false);
      onRefresh();
    } catch (err) {
      alert('Error saving component');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Yakin ingin menghapus komponen ini?')) {
      try {
        await payrollAPI.deleteComponent(id);
        onRefresh();
      } catch (err) {
        alert('Error deleting component');
      }
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Komponen Gaji & Potongan</h3>
        <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center text-sm font-medium hover:bg-blue-700">
          <Plus size={16} className="mr-2" /> Tambah Komponen
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Komponen</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipe</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Perhitungan</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metode Kalkulasi</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pajak</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Default Value</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.length === 0 ? (
              <tr><td colSpan="7" className="px-6 py-4 text-center text-gray-500">Belum ada komponen</td></tr>
            ) : data.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.type === 'ALLOWANCE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {item.type === 'ALLOWANCE' ? 'Tunjangan' : 'Potongan'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.isFixed ? 'Nominal Tetap' : 'Persentase (%)'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.calculationType === 'PER_ATTENDANCE' ? 'bg-amber-100 text-amber-800' : item.calculationType === 'CONDITIONAL' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                    {item.calculationType === 'PER_ATTENDANCE' ? 'Per Kehadiran' : item.calculationType === 'CONDITIONAL' ? 'Bersyarat' : 'Tetap Bulanan'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.isTaxable ? <span className="text-red-600 font-medium">Kena Pajak</span> : <span className="text-green-600">Non-Pajak</span>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.isFixed ? `Rp ${item.defaultValue.toLocaleString('id-ID')}` : `${item.defaultValue}%`}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => handleOpenModal(item)} className="text-blue-600 hover:text-blue-900 mr-3 p-1"><Edit size={16} /></button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-900 p-1"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingItem ? 'Edit Komponen' : 'Tambah Komponen'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Komponen</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipe</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                  <option value="ALLOWANCE">Tunjangan</option>
                  <option value="DEDUCTION">Potongan</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Perhitungan</label>
                <select value={formData.isFixed ? 'true' : 'false'} onChange={e => setFormData({...formData, isFixed: e.target.value === 'true'})} className="w-full border rounded-lg px-3 py-2">
                  <option value="true">Nominal Tetap (Rp)</option>
                  <option value="false">Persentase (%)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Value</label>
                <input type="number" value={formData.defaultValue} onChange={e => setFormData({...formData, defaultValue: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Metode Kalkulasi</label>
                <select value={formData.calculationType} onChange={e => setFormData({...formData, calculationType: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                  <option value="FIXED_MONTHLY">Tetap Bulanan (Fixed Monthly)</option>
                  <option value="PER_ATTENDANCE">Per Hari Kehadiran (Per Attendance)</option>
                  <option value="CONDITIONAL">Bersyarat (Conditional)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {formData.calculationType === 'PER_ATTENDANCE' ? 'Nominal akan dikalikan jumlah hari hadir.' : 
                   formData.calculationType === 'CONDITIONAL' ? 'Diberikan jika syarat terpenuhi (mis. hadir penuh).' :
                   'Nominal diberikan penuh setiap bulan.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="isTaxable" checked={formData.isTaxable} onChange={e => setFormData({...formData, isTaxable: e.target.checked})} className="rounded" />
                <label htmlFor="isTaxable" className="text-sm font-medium text-gray-700">Kena Pajak (PPh 21)</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


const OvertimeTab = ({ data, onRefresh, config, globalSettings }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', dayType: 'WORKDAY', hourFrom: 0, hourTo: 1, multiplier: 1.5 });

  const handleToggleOvertime = async () => {
    try {
      const newValue = config.overtimeEnabled === 'true' ? 'false' : 'true';
      await payrollAPI.updateConfig({ overtimeEnabled: newValue });
      onRefresh();
    } catch (err) {
      alert('Gagal update config');
    }
  };

  const handleOpenModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setFormData({ name: item.name, dayType: item.dayType, hourFrom: item.hourFrom, hourTo: item.hourTo, multiplier: item.multiplier });
    } else {
      setEditingItem(null);
      setFormData({ name: '', dayType: 'WORKDAY', hourFrom: 0, hourTo: 1, multiplier: 1.5 });
    }
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingItem) {
        await payrollAPI.updateOvertimeRule(editingItem.id, formData);
      } else {
        await payrollAPI.createOvertimeRule(formData);
      }
      setModalOpen(false);
      onRefresh();
    } catch (err) {
      alert('Error saving rule');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Yakin ingin menghapus aturan lembur ini?')) {
      try {
        await payrollAPI.deleteOvertimeRule(id);
        onRefresh();
      } catch (err) {
        alert('Error deleting rule');
      }
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Aturan Lembur (Overtime)</h3>
          <p className="text-sm text-gray-500">Konfigurasi perhitungan lembur bertingkat</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Status Lembur:</span>
            <button 
              onClick={handleToggleOvertime}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${config.overtimeEnabled === 'true' ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
            >
              {config.overtimeEnabled === 'true' ? 'AKTIF' : 'NONAKTIF'}
            </button>
          </div>
          <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center text-sm font-medium hover:bg-blue-700">
            <Plus size={16} className="mr-2" /> Tambah Aturan
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipe Hari</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Aturan</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jam Ke</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Multiplier</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.length === 0 ? (
              <tr><td colSpan="5" className="px-6 py-4 text-center text-gray-500">Belum ada aturan lembur</td></tr>
            ) : data.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {item.dayType === 'WORKDAY' ? 'Hari Kerja' : item.dayType === 'WEEKEND' ? 'Libur Mingguan' : 'Hari Libur Nasional'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Jam {item.hourFrom} s/d {item.hourTo}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.multiplier}x</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => handleOpenModal(item)} className="text-blue-600 hover:text-blue-900 mr-3 p-1"><Edit size={16} /></button>
                  <button onClick={() => handleDelete(item.id)} className="text-red-600 hover:text-red-900 p-1"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">{editingItem ? 'Edit Aturan' : 'Tambah Aturan'}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Aturan</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg px-3 py-2" placeholder="Contoh: Jam Kerja 1-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Hari</label>
                <select value={formData.dayType} onChange={e => setFormData({...formData, dayType: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                  <option value="WORKDAY">
                    Hari Kerja Biasa ({(() => {
                      const days = JSON.parse(globalSettings.workingDays || '[1,2,3,4,5]');
                      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
                      return days.map(d => dayNames[d]).join(', ');
                    })()})
                  </option>
                  <option value="WEEKEND">
                    Hari Libur / Akhir Pekan ({(() => {
                      const days = JSON.parse(globalSettings.workingDays || '[1,2,3,4,5]');
                      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
                      return [0,1,2,3,4,5,6].filter(d => !days.includes(d)).map(d => dayNames[d]).join(', ');
                    })()})
                  </option>
                  <option value="HOLIDAY">Hari Libur Nasional</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dari Jam</label>
                  <input type="number" step="0.5" value={formData.hourFrom} onChange={e => setFormData({...formData, hourFrom: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hingga Jam</label>
                  <input type="number" step="0.5" value={formData.hourTo} onChange={e => setFormData({...formData, hourTo: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pengali (Multiplier)</label>
                <input type="number" step="0.5" value={formData.multiplier} onChange={e => setFormData({...formData, multiplier: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg px-3 py-2" placeholder="Contoh: 1.5" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Simpan</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};



const AssignSalaryTab = ({ data, components, onRefresh, config }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  
  // Filtering states
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDept, setSearchDept] = useState('All');

  // Modal form data
  const [formData, setFormData] = useState({ 
    employmentType: 'TETAP', 
    salaryType: 'MONTHLY', 
    baseSalary: 0, 
    contractEnd: '',
    components: []
  });

  // Derived filter
  const filteredData = data.filter(emp => {
    // 1. Only show ALL IN and HARIAN
    if (emp.salaryCategory !== 'ALL IN' && emp.salaryCategory !== 'HARIAN') return false;
    
    // 2. Search Name / NIK
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!emp.name.toLowerCase().includes(term) && !emp.employeeCode.toLowerCase().includes(term)) return false;
    }
    
    // 3. Dept filter
    if (searchDept !== 'All' && emp.dept !== searchDept) return false;
    
    return true;
  });

  const departments = ['All', ...new Set(data.map(emp => emp.dept).filter(d => d && d !== '-'))];

  const handleOpenModal = (emp) => {
    setSelectedEmp(emp);
    
    // Process existing components from employee vs global components
    const existingComps = emp.salary?.components || [];
    const mergedComps = components
      .filter(c => c.type === 'ALLOWANCE' && c.isActive)
      .map(comp => {
        const existing = existingComps.find(ec => ec.componentId === comp.id);
        return {
          componentId: comp.id,
          name: comp.name,
          type: comp.type,
          value: existing ? existing.value : 0
        };
      });

    // Sync classification with Employee model if not set in salary
    let initialEmpType = emp.salary?.employmentType;
    if (!initialEmpType) {
      if (emp.employmentStatus?.toLowerCase().includes('kontrak') || emp.employmentStatus === 'PKWT') initialEmpType = 'KONTRAK';
      else if (emp.salaryCategory === 'HARIAN') initialEmpType = 'HARIAN';
      else initialEmpType = 'TETAP';
    }

    let initialSalaryType = emp.salary?.salaryType;
    if (!initialSalaryType) {
      initialSalaryType = (emp.salaryCategory === 'HARIAN') ? 'DAILY' : 'MONTHLY';
    }

    setFormData({
      employmentType: initialEmpType,
      salaryType: initialSalaryType,
      baseSalary: emp.salary?.baseSalary || 0,
      dailyRate: emp.salary?.dailyRate || 0,
      contractEnd: emp.salary?.contractEnd ? new Date(emp.salary.contractEnd).toISOString().split('T')[0] : '',
      components: mergedComps
    });
    setModalOpen(true);
  };

  const handleComponentValueChange = (compId, val) => {
    setFormData({
      ...formData,
      components: formData.components.map(c => c.componentId === compId ? { ...c, value: val } : c)
    });
  };

  const handleSave = async () => {
    try {
      await payrollAPI.setEmployeeSalary(selectedEmp.id, formData);
      setModalOpen(false);
      onRefresh();
    } catch (err) {
      alert('Gagal menyimpan gaji karyawan');
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('id-ID').format(val || 0);
  };

  const parseCurrency = (str) => {
    const numStr = String(str).replace(/[^0-9]/g, '');
    return parseInt(numStr) || 0;
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
        <h3 className="text-lg font-semibold text-gray-800">Assign Gaji: ALL IN & HARIAN</h3>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <input 
            type="text" 
            placeholder="Cari NIK / Nama..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-full sm:w-48 focus:ring-blue-500 focus:border-blue-500"
          />
          <select 
            value={searchDept}
            onChange={(e) => setSearchDept(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {departments.map(d => <option key={d} value={d}>{d === 'All' ? 'Semua Dept' : d}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">NIK</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dept</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kategori</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gaji Pokok/Harian</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredData.length === 0 ? (
              <tr><td colSpan="6" className="px-6 py-4 text-center text-gray-500">Tidak ada data karyawan ALL IN/HARIAN yang sesuai filter</td></tr>
            ) : filteredData.map(emp => (
              <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{emp.employeeCode}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{emp.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{emp.dept}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium mr-2">
                    {emp.salaryCategory}
                  </span>
                  {emp.salary?.salaryType || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  Rp {emp.salary?.salaryType === 'DAILY' 
                    ? formatCurrency(emp.salary?.dailyRate || 0)
                    : formatCurrency(emp.salary?.baseSalary || 0)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button onClick={() => handleOpenModal(emp)} className="text-blue-600 hover:text-blue-900 p-1 bg-blue-50 rounded-md"><Edit size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && selectedEmp && (
        <div 
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
          onClick={() => setModalOpen(false)}
        >
          <div 
            className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-4">Assign Gaji: {selectedEmp.name}</h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status Karyawan</label>
                  <div className="w-full bg-gray-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 font-semibold">
                    {formData.employmentType === 'TETAP' ? 'Karyawan Tetap (PKWTT)' : 
                     formData.employmentType === 'KONTRAK' ? 'Karyawan Kontrak (PKWT)' : 
                     'Karyawan Harian Lepas'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Pembayaran</label>
                  <div className="w-full bg-gray-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 font-semibold">
                    {formData.salaryType === 'MONTHLY' ? 'Bulanan (Monthly)' : 'Harian (Daily)'}
                  </div>
                </div>
              </div>
              {formData.salaryType === 'MONTHLY' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gaji Pokok (Rp) - Bulanan</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Rp.</span>
                    <input 
                      type="text" 
                      value={formatCurrency(formData.baseSalary)} 
                      onChange={e => setFormData({...formData, baseSalary: parseCurrency(e.target.value)})} 
                      className="w-full border rounded-lg pl-10 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500 font-medium" 
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gaji Pokok (Rp) - Harian</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Rp.</span>
                    <input 
                      type="text" 
                      value={formatCurrency(formData.dailyRate)} 
                      onChange={e => setFormData({...formData, dailyRate: parseCurrency(e.target.value)})} 
                      className="w-full border rounded-lg pl-10 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500 font-medium" 
                    />
                  </div>
                </div>
              )}

              {/* Tunjangan / Allowances */}
              {formData.components && formData.components.length > 0 && (
                <div className="pt-4 border-t mt-4">
                  <h4 className="font-medium text-gray-800 mb-3">Tunjangan (Allowances)</h4>
                  <div className="space-y-3">
                    {formData.components.map((comp) => (
                      <div key={comp.componentId}>
                        <label className="block text-sm text-gray-600 mb-1">{comp.name}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Rp.</span>
                          <input 
                            type="text" 
                            value={formatCurrency(comp.value)} 
                            onChange={e => handleComponentValueChange(comp.componentId, parseCurrency(e.target.value))} 
                            className="w-full border rounded-lg pl-10 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500" 
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {formData.employmentType === 'KONTRAK' && (
                <div className="pt-4 border-t">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Akhir Kontrak (PKWT)</label>
                  <input type="date" value={formData.contractEnd} onChange={e => setFormData({...formData, contractEnd: e.target.value})} className="w-full border rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-4 border-t">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">Simpan Gaji</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Allowance Matrix Tab ──────────────────────────────────────────────────

const AllowanceMatrixTab = ({ data, onRefresh }) => {
  const [matrixValues, setMatrixValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.matrix) {
      setMatrixValues(JSON.parse(JSON.stringify(data.matrix)));
      setDirty(false);
    }
  }, [data]);

  if (!data) return <div className="text-center text-gray-500 py-8">Memuat data matriks...</div>;

  const { positions, components } = data;

  const formatCurrency = (val) => new Intl.NumberFormat('id-ID').format(val || 0);
  const parseCurrency = (str) => parseInt(String(str).replace(/[^0-9]/g, '')) || 0;

  const handleValueChange = (position, componentId, rawVal) => {
    const numericVal = parseCurrency(rawVal);
    setMatrixValues(prev => ({
      ...prev,
      [position]: {
        ...prev[position],
        [componentId]: numericVal
      }
    }));
    setDirty(true);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const entries = [];
      for (const position of positions) {
        for (const comp of components) {
          const val = matrixValues[position]?.[comp.id] || 0;
          entries.push({ position, salaryComponentId: comp.id, nominal: val });
        }
      }
      await payrollAPI.batchUpsertPositionAllowances({ entries });
      alert('Matriks tunjangan berhasil disimpan!');
      setDirty(false);
      onRefresh();
    } catch (err) {
      alert('Gagal menyimpan matriks tunjangan');
    } finally {
      setSaving(false);
    }
  };

  if (positions.length === 0 || components.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto mb-3 text-amber-500" size={36} />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">Data Belum Lengkap</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          {positions.length === 0 
            ? 'Belum ada Jabatan/Position yang terdaftar di data karyawan. Pastikan karyawan memiliki data "Position/Jabatan".' 
            : 'Belum ada Komponen Gaji bertipe "Tunjangan" yang aktif. Silakan tambahkan di tab "Komponen Gaji" terlebih dahulu.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Matriks Tunjangan per Jabatan</h3>
          <p className="text-sm text-gray-500 mt-1">
            Atur besaran tunjangan berdasarkan jabatan karyawan. Nilai ini akan menjadi default saat assign gaji.
          </p>
        </div>
        <button 
          onClick={handleSaveAll} 
          disabled={saving || !dirty}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg font-medium text-sm shadow-sm transition-all ${
            dirty 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Save size={16} />
          {saving ? 'Menyimpan...' : 'Simpan Semua Perubahan'}
        </button>
      </div>

      <div className="overflow-x-auto border rounded-xl">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase sticky left-0 bg-gray-50 z-20 min-w-[160px] border-r">
                Jabatan / Position
              </th>
              {components.map(comp => (
                <th key={comp.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase min-w-[180px]">
                  <div>{comp.name}</div>
                  <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                    {comp.calculationType === 'PER_ATTENDANCE' ? '(Per Kehadiran)' : comp.calculationType === 'CONDITIONAL' ? '(Bersyarat)' : '(Tetap/Bulan)'}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {positions.map((pos, idx) => (
              <tr key={pos} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                <td className="px-4 py-2 text-sm font-semibold text-gray-800 sticky left-0 bg-inherit z-10 border-r whitespace-nowrap">
                  {pos}
                </td>
                {components.map(comp => (
                  <td key={comp.id} className="px-2 py-1 text-center">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">Rp</span>
                      <input
                        type="text"
                        value={formatCurrency(matrixValues[pos]?.[comp.id] || 0)}
                        onChange={e => handleValueChange(pos, comp.id, e.target.value)}
                        className="w-full border border-gray-200 rounded-md pl-7 pr-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dirty && (
        <div className="mt-3 flex items-center gap-2 text-amber-600 text-sm">
          <AlertCircle size={14} />
          <span>Ada perubahan yang belum disimpan. Klik "Simpan Semua Perubahan" untuk menyimpan.</span>
        </div>
      )}
    </div>
  );
};

export default PayrollSettings;
