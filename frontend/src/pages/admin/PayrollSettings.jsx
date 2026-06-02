import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Banknote, FileText, Clock, Users, Plus, Edit, Trash2, Save, X, AlertCircle, Settings2, LayoutGrid, Loader2, ChevronDown
} from 'lucide-react';
import { payrollAPI, settingsAPI, employeeAPI } from '../../services/api';

const PayrollSettings = () => {
  const { t } = useTranslation();
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
    { id: 'components', label: t('payrollSettings.tabs.components'), icon: Banknote },
    { id: 'matrix', label: t('payrollSettings.tabs.matrix'), icon: LayoutGrid },
    { id: 'overtime', label: t('payrollSettings.tabs.overtime'), icon: Clock },
    { id: 'assign', label: t('payrollSettings.tabs.assign'), icon: Settings2 },
    { id: 'umk', label: t('payrollSettings.tabs.umk'), icon: FileText },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">{t('payrollSettings.title')}</h1>
          <p className="text-gray-600 text-sm mt-1">{t('payrollSettings.subtitle')}</p>
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
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [umkSalary, setUmkSalary] = useState(config.umkSalary || 0);

  const formatCurrency = (val) => new Intl.NumberFormat('id-ID').format(val || 0);
  const parseCurrency = (str) => parseInt(String(str).replace(/[^0-9]/g, '')) || 0;

  const handleSave = async () => {
    setLoading(true);
    try {
      await payrollAPI.updateConfig({ umkSalary: umkSalary.toString() });
      alert(t('payrollSettings.umkTab.alerts.saveSuccess'));
      onRefresh();
    } catch (err) {
      alert(t('payrollSettings.umkTab.alerts.saveError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('payrollSettings.umkTab.title')}</h3>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.umkTab.basicSalary')}</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">Rp.</span>
            <input 
              type="text" 
              value={formatCurrency(umkSalary)} 
              onChange={e => setUmkSalary(parseCurrency(e.target.value))} 
              className="w-full border rounded-lg pl-10 pr-3 py-2 focus:ring-blue-500 focus:border-blue-500 font-medium text-lg" 
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">{t('payrollSettings.umkTab.desc')}</p>
        </div>
        <button 
          onClick={handleSave} 
          disabled={loading}
          className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? t('payrollSettings.umkTab.saving') : t('payrollSettings.umkTab.btnSave')}
        </button>
      </div>
    </div>
  );
};

// ─── Sub Components ────────────────────────────────────────────────────────

const ComponentsTab = ({ data, onRefresh }) => {
  const { t } = useTranslation();
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
      alert(t('payrollSettings.componentsTab.alerts.saveError'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('payrollSettings.componentsTab.alerts.deleteConfirm'))) {
      try {
        await payrollAPI.deleteComponent(id);
        onRefresh();
      } catch (err) {
        alert(t('payrollSettings.componentsTab.alerts.deleteError'));
      }
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{t('payrollSettings.componentsTab.title')}</h3>
        <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center text-sm font-medium hover:bg-blue-700">
          <Plus size={16} className="mr-2" /> {t('payrollSettings.componentsTab.addComponent')}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.componentsTab.table.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.componentsTab.table.type')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.componentsTab.table.calculation')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.componentsTab.table.method')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.componentsTab.table.tax')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.componentsTab.table.defaultValue')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.componentsTab.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.length === 0 ? (
              <tr><td colSpan="7" className="px-6 py-4 text-center text-gray-500">{t('payrollSettings.componentsTab.table.noComponents')}</td></tr>
            ) : data.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.type === 'ALLOWANCE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {item.type === 'ALLOWANCE' ? t('payrollSettings.componentsTab.table.allowance') : t('payrollSettings.componentsTab.table.deduction')}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.isFixed ? t('payrollSettings.componentsTab.table.fixed') : t('payrollSettings.componentsTab.table.percentage')}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${item.calculationType === 'PER_ATTENDANCE' ? 'bg-amber-100 text-amber-800' : item.calculationType === 'CONDITIONAL' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                    {item.calculationType === 'PER_ATTENDANCE' ? t('payrollSettings.componentsTab.table.perAttendance') : item.calculationType === 'CONDITIONAL' ? t('payrollSettings.componentsTab.table.conditional') : t('payrollSettings.componentsTab.table.fixedMonthly')}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {item.isTaxable ? <span className="text-red-600 font-medium">{t('payrollSettings.componentsTab.table.taxable')}</span> : <span className="text-green-600">{t('payrollSettings.componentsTab.table.nonTaxable')}</span>}
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
            <h2 className="text-xl font-bold mb-4">{editingItem ? t('payrollSettings.componentsTab.editComponent') : t('payrollSettings.componentsTab.addComponent')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.componentsTab.form.name')}</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.componentsTab.form.type')}</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                  <option value="ALLOWANCE">{t('payrollSettings.componentsTab.table.allowance')}</option>
                  <option value="DEDUCTION">{t('payrollSettings.componentsTab.table.deduction')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.componentsTab.form.calculation')}</label>
                <select value={formData.isFixed ? 'true' : 'false'} onChange={e => setFormData({...formData, isFixed: e.target.value === 'true'})} className="w-full border rounded-lg px-3 py-2">
                  <option value="true">{t('payrollSettings.componentsTab.form.fixedRp')}</option>
                  <option value="false">{t('payrollSettings.componentsTab.form.percent')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.componentsTab.form.defaultValue')}</label>
                <input type="number" value={formData.defaultValue} onChange={e => setFormData({...formData, defaultValue: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.componentsTab.form.method')}</label>
                <select value={formData.calculationType} onChange={e => setFormData({...formData, calculationType: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                  <option value="FIXED_MONTHLY">{t('payrollSettings.componentsTab.table.fixedMonthly')}</option>
                  <option value="PER_ATTENDANCE">{t('payrollSettings.componentsTab.table.perAttendance')}</option>
                  <option value="CONDITIONAL">{t('payrollSettings.componentsTab.table.conditional')}</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {formData.calculationType === 'PER_ATTENDANCE' ? t('payrollSettings.componentsTab.form.perAttendanceDesc') : 
                   formData.calculationType === 'CONDITIONAL' ? t('payrollSettings.componentsTab.form.conditionalDesc') :
                   t('payrollSettings.componentsTab.form.fixedMonthlyDesc')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" id="isTaxable" checked={formData.isTaxable} onChange={e => setFormData({...formData, isTaxable: e.target.checked})} className="rounded" />
                <label htmlFor="isTaxable" className="text-sm font-medium text-gray-700">{t('payrollSettings.componentsTab.form.taxable')}</label>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('payrollSettings.componentsTab.form.cancel')}</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{t('payrollSettings.componentsTab.form.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const OvertimeTab = ({ data, onRefresh, config, globalSettings }) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ name: '', dayType: 'WORKDAY', hourFrom: 0, hourTo: 1, multiplier: 1.5 });

  const handleToggleOvertime = async () => {
    try {
      const newValue = config.overtimeEnabled === 'true' ? 'false' : 'true';
      await payrollAPI.updateConfig({ overtimeEnabled: newValue });
      onRefresh();
    } catch (err) {
      alert(t('payrollSettings.overtimeTab.alerts.toggleError'));
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
      alert(t('payrollSettings.overtimeTab.alerts.saveError'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t('payrollSettings.overtimeTab.alerts.deleteConfirm'))) {
      try {
        await payrollAPI.deleteOvertimeRule(id);
        onRefresh();
      } catch (err) {
        alert(t('payrollSettings.overtimeTab.alerts.deleteError'));
      }
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{t('payrollSettings.overtimeTab.title')}</h3>
          <p className="text-sm text-gray-500">{t('payrollSettings.overtimeTab.subtitle')}</p>
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">{t('payrollSettings.overtimeTab.status')}</span>
            <button 
              onClick={handleToggleOvertime}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${config.overtimeEnabled === 'true' ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'}`}
            >
              {config.overtimeEnabled === 'true' ? t('payrollSettings.overtimeTab.active') : t('payrollSettings.overtimeTab.inactive')}
            </button>
          </div>
          <button onClick={() => handleOpenModal()} className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center text-sm font-medium hover:bg-blue-700">
            <Plus size={16} className="mr-2" /> {t('payrollSettings.overtimeTab.addRule')}
          </button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.overtimeTab.table.dayType')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.overtimeTab.table.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.overtimeTab.table.hour')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.overtimeTab.table.multiplier')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.overtimeTab.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.length === 0 ? (
              <tr><td colSpan="5" className="px-6 py-4 text-center text-gray-500">{t('payrollSettings.overtimeTab.table.noRules')}</td></tr>
            ) : data.map(item => (
              <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {item.dayType === 'WORKDAY' ? t('payrollSettings.overtimeTab.table.workday') : item.dayType === 'WEEKEND' ? t('payrollSettings.overtimeTab.table.weekend') : t('payrollSettings.overtimeTab.table.holiday')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{t('payrollSettings.overtimeTab.table.hourFromTo', { from: item.hourFrom, to: item.hourTo })}</td>
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
            <h2 className="text-xl font-bold mb-4">{editingItem ? t('payrollSettings.overtimeTab.editRule') : t('payrollSettings.overtimeTab.addRule')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.overtimeTab.form.name')}</label>
                <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border rounded-lg px-3 py-2" placeholder={t('payrollSettings.overtimeTab.form.namePlaceholder')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.overtimeTab.form.dayType')}</label>
                <select value={formData.dayType} onChange={e => setFormData({...formData, dayType: e.target.value})} className="w-full border rounded-lg px-3 py-2">
                  <option value="WORKDAY">
                    {t('payrollSettings.overtimeTab.form.regularWorkday')} ({(() => {
                      const days = JSON.parse(globalSettings.workingDays || '[1,2,3,4,5]');
                      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
                      return days.map(d => dayNames[d]).join(', ');
                    })()})
                  </option>
                  <option value="WEEKEND">
                    {t('payrollSettings.overtimeTab.form.weekendOff')} ({(() => {
                      const days = JSON.parse(globalSettings.workingDays || '[1,2,3,4,5]');
                      const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
                      return [0,1,2,3,4,5,6].filter(d => !days.includes(d)).map(d => dayNames[d]).join(', ');
                    })()})
                  </option>
                  <option value="HOLIDAY">{t('payrollSettings.overtimeTab.table.holiday')}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.overtimeTab.form.fromHour')}</label>
                  <input type="number" step="0.5" value={formData.hourFrom} onChange={e => setFormData({...formData, hourFrom: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.overtimeTab.form.toHour')}</label>
                  <input type="number" step="0.5" value={formData.hourTo} onChange={e => setFormData({...formData, hourTo: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg px-3 py-2" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.overtimeTab.form.multiplier')}</label>
                <input type="number" step="0.5" value={formData.multiplier} onChange={e => setFormData({...formData, multiplier: parseFloat(e.target.value) || 0})} className="w-full border rounded-lg px-3 py-2" placeholder={t('payrollSettings.overtimeTab.form.multiplierPlaceholder')} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('payrollSettings.overtimeTab.form.cancel')}</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{t('payrollSettings.overtimeTab.form.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const AssignSalaryTab = ({ data, components, onRefresh, config }) => {
  const { t } = useTranslation();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [isSyncGajiOpen, setIsSyncGajiOpen] = useState(false);
  
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
      alert(t('payrollSettings.assignTab.alerts.saveError'));
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-800">{t('payrollSettings.assignTab.title')}</h3>
          <button 
            onClick={() => setIsSyncGajiOpen(true)} 
            className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold py-1.5 px-3.5 rounded-xl text-xs uppercase tracking-wider border border-emerald-200 hover:border-emerald-300 shadow-sm transition-all active:scale-95 group cursor-pointer"
          >
            <Banknote className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
            {t('payrollSettings.assignTab.syncNormal')}
          </button>
        </div>
        
        <div className="flex gap-2 w-full sm:w-auto">
          <input 
            type="text" 
            placeholder={t('payrollSettings.assignTab.searchPlaceholder')} 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm w-full sm:w-48 focus:ring-blue-500 focus:border-blue-500"
          />
          <select 
            value={searchDept}
            onChange={(e) => setSearchDept(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            {departments.map(d => <option key={d} value={d}>{d === 'All' ? t('payrollSettings.assignTab.allDepts') : d}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.assignTab.table.nik')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.assignTab.table.name')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.assignTab.table.dept')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.assignTab.table.category')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.assignTab.table.baseSalary')}</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('payrollSettings.assignTab.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredData.length === 0 ? (
              <tr><td colSpan="6" className="px-6 py-4 text-center text-gray-500">{t('payrollSettings.assignTab.table.noData')}</td></tr>
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
            <h2 className="text-xl font-bold mb-4">{t('payrollSettings.assignTab.modal.title', { name: selectedEmp.name })}</h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.assignTab.modal.empStatus')}</label>
                  <div className="w-full bg-gray-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 font-semibold">
                    {formData.employmentType === 'TETAP' ? t('payrollSettings.assignTab.modal.permanent') : 
                     formData.employmentType === 'KONTRAK' ? t('payrollSettings.assignTab.modal.contract') : 
                     t('payrollSettings.assignTab.modal.dailyWorker')}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.assignTab.modal.paymentType')}</label>
                  <div className="w-full bg-gray-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 font-semibold">
                    {formData.salaryType === 'MONTHLY' ? t('payrollSettings.assignTab.modal.monthlyType') : t('payrollSettings.assignTab.modal.dailyType')}
                  </div>
                </div>
              </div>
              {formData.salaryType === 'MONTHLY' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.assignTab.modal.baseMonthly')}</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.assignTab.modal.baseDaily')}</label>
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
                  <h4 className="font-medium text-gray-800 mb-3">{t('payrollSettings.assignTab.modal.allowances')}</h4>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('payrollSettings.assignTab.modal.contractEnd')}</label>
                  <input type="date" value={formData.contractEnd} onChange={e => setFormData({...formData, contractEnd: e.target.value})} className="w-full border rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-8 pt-4 border-t">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">{t('payrollSettings.assignTab.modal.cancel')}</button>
              <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">{t('payrollSettings.assignTab.modal.save')}</button>
            </div>
          </div>
        </div>
      )}
      
      {isSyncGajiOpen && (
        <SyncGajiNormalModal 
          onClose={() => setIsSyncGajiOpen(false)}
          onDone={() => { setIsSyncGajiOpen(false); onRefresh(); }}
        />
      )}
    </div>
  );
};

const SyncGajiNormalModal = ({ onClose, onDone }) => {
  const { t } = useTranslation();
  const [selectedDept, setSelectedDept] = useState('');
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [deptLoading, setDeptLoading] = useState(true);

  useEffect(() => {
    const fetchDepts = async () => {
      try {
        const res = await employeeAPI.getMasterOptions({});
        setDepartments(res.data?.departments || []);
      } catch (err) {
        console.error('Failed to load departments', err);
      } finally {
        setDeptLoading(false);
      }
    };
    fetchDepts();
  }, []);

  useEffect(() => {
    if (selectedDept) {
      fetchDeptEmployees(selectedDept);
    } else {
      setEmployees([]);
      setSelectedIds([]);
    }
  }, [selectedDept]);

  const fetchDeptEmployees = async (dept) => {
    setLoading(true);
    try {
      const res = await employeeAPI.getAll({ dept, limit: 1000, excludeBhl: true });
      setEmployees(res.data || []);
      // Auto-select all by default - USE dbId (database integer ID) NOT id (string employee code)
      setSelectedIds((res.data || []).map(e => e.dbId));
    } catch (err) {
      alert(t('payrollSettings.syncModal.alerts.syncError'));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(employees.map(emp => emp.dbId));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleEmployee = (dbId) => {
    setSelectedIds(prev => 
      prev.includes(dbId) ? prev.filter(e => e !== dbId) : [...prev, dbId]
    );
  };

  const handleSync = async () => {
    if (selectedIds.length === 0) return alert(t('payrollSettings.syncModal.alerts.selectMin'));
    if (!window.confirm(t('payrollSettings.syncModal.alerts.confirmSync', { count: selectedIds.length }))) return;
    
    setSyncing(true);
    try {
      await employeeAPI.batchUpdateSalaryCategory({ 
        employeeIds: selectedIds, 
        salaryCategory: 'UMK/UMR' 
      });
      alert(t('payrollSettings.syncModal.alerts.syncSuccess'));
      onDone();
    } catch (err) {
      alert(t('payrollSettings.syncModal.alerts.syncError'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white rounded-2xl w-full max-w-2xl relative z-10 flex flex-col max-h-[90vh] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-emerald-50/30 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center border border-emerald-200">
              <Banknote className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-xl">{t('payrollSettings.syncModal.title')}</h3>
              <p className="text-xs text-slate-500 mt-1">{t('payrollSettings.syncModal.subtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-xl transition-all">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('payrollSettings.syncModal.step1')}</label>
            <div className="relative">
              <select
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                disabled={deptLoading}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all appearance-none cursor-pointer pr-10"
              >
                <option value="">{deptLoading ? t('payrollSettings.syncModal.loadingDepts') : t('payrollSettings.syncModal.selectDept')}</option>
                {departments.map(d => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          </div>

          {selectedDept && (
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="block text-sm font-semibold text-slate-700">{t('payrollSettings.syncModal.step2', { count: selectedIds.length, total: employees.length })}</label>
              </div>
              
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {loading ? (
                  <div className="p-8 flex flex-col items-center text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
                    <span className="text-sm">{t('payrollSettings.syncModal.loadingEmployees')}</span>
                  </div>
                ) : employees.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    {t('payrollSettings.syncModal.noEmployees')}
                  </div>
                ) : (
                  <>
                    <div className="bg-slate-50 p-3 border-b border-slate-200 flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        id="syncSelectAll"
                        checked={selectedIds.length === employees.length && employees.length > 0}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <label htmlFor="syncSelectAll" className="text-sm font-bold text-slate-700 cursor-pointer select-none">{t('payrollSettings.syncModal.selectAll')}</label>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {employees.map(emp => (
                        <label key={emp.dbId} className="flex items-center gap-4 p-3 hover:bg-slate-50 cursor-pointer transition-colors select-none">
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(emp.dbId)}
                            onChange={() => handleToggleEmployee(emp.dbId)}
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                          />
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{emp.name}</p>
                            <p className="text-xs text-slate-500">{(emp.employeeCode || emp.id)} • {emp.position || 'No Position'}</p>
                          </div>
                          <div className="ml-auto">
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold rounded-md uppercase">
                              {emp.salaryCategory || 'BLM DISET'}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-200 transition-all text-sm cursor-pointer">
            {t('payrollSettings.syncModal.cancel')}
          </button>
          <button 
            onClick={handleSync} 
            disabled={syncing || selectedIds.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {syncing ? <><Loader2 className="w-4 h-4 animate-spin" /> {t('payrollSettings.syncModal.syncing')}</> : <><Save className="w-4 h-4" /> {t('payrollSettings.syncModal.btnSync')}</>}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Allowance Matrix Tab ──────────────────────────────────────────────────

const AllowanceMatrixTab = ({ data, onRefresh }) => {
  const { t } = useTranslation();
  const [matrixValues, setMatrixValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data?.matrix) {
      setMatrixValues(JSON.parse(JSON.stringify(data.matrix)));
      setDirty(false);
    }
  }, [data]);

  if (!data) return <div className="text-center text-gray-500 py-8">{t('payrollSettings.matrixTab.saving')}</div>;

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
      alert(t('payrollSettings.matrixTab.alerts.saveSuccess'));
      setDirty(false);
      onRefresh();
    } catch (err) {
      alert(t('payrollSettings.matrixTab.alerts.saveError'));
    } finally {
      setSaving(false);
    }
  };

  if (positions.length === 0 || components.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto mb-3 text-amber-500" size={36} />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">{t('payrollSettings.matrixTab.empty.title')}</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          {positions.length === 0 
            ? t('payrollSettings.matrixTab.empty.noPositions') 
            : t('payrollSettings.matrixTab.empty.noAllowances')}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{t('payrollSettings.matrixTab.title')}</h3>
          <p className="text-sm text-gray-500 mt-1">
            {t('payrollSettings.matrixTab.subtitle')}
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
          {saving ? t('payrollSettings.matrixTab.saving') : t('payrollSettings.matrixTab.btnSave')}
        </button>
      </div>

      <div className="overflow-x-auto border rounded-xl">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase sticky left-0 bg-gray-50 z-20 min-w-[160px] border-r">
                {t('payrollSettings.matrixTab.position')}
              </th>
              {components.map(comp => (
                <th key={comp.id} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase min-w-[180px]">
                  <div>{comp.name}</div>
                  <div className="text-[10px] font-normal text-gray-400 mt-0.5">
                    {comp.calculationType === 'PER_ATTENDANCE' ? `(${t('payrollSettings.componentsTab.table.perAttendance')})` : comp.calculationType === 'CONDITIONAL' ? `(${t('payrollSettings.componentsTab.table.conditional')})` : `(${t('payrollSettings.componentsTab.table.fixedMonthly')})`}
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
          <span>{t('payrollSettings.matrixTab.unsaved')}</span>
        </div>
      )}
    </div>
  );
};

export default PayrollSettings;
