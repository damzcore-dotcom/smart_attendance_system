import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  MapPin, 
  Clock, 
  ShieldCheck, 
  Building2, 
  Save, 
  Plus, 
  Trash2, 
  Target,
  Bell,
  Globe,
  Loader2,
  X,
  Shield,
  CalendarCheck,
  CheckCircle2,
  AlertCircle,
  FileText,
  CreditCard,
  Edit
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsAPI, authAPI } from '../../services/api';
import LocationMapModal from '../../components/modals/LocationMapModal';
import AdminPermissions from '../../components/admin/AdminPermissions';
import SlipTemplateBuilder from '../../components/admin/SlipTemplateBuilder';
import AttendanceTemplateBuilder from '../../components/admin/AttendanceTemplateBuilder';
import IDCardTemplateBuilder from '../../components/admin/IDCardTemplateBuilder';
import CompanyCalendarSettings from '../../components/admin/CompanyCalendarSettings';
import SettingsCameras from '../../components/admin/SettingsCameras';
import { Camera as CameraIcon } from 'lucide-react';
import PenaltySettings from '../../components/admin/PenaltySettings';

const Settings = () => {
  const { t } = useTranslation();
  const weekdayNamesObj = t('settingsPage.calendar.weekdayNames', { returnObjects: true });
  const weekdayNames = Array.isArray(weekdayNamesObj) ? weekdayNamesObj : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const queryClient = useQueryClient();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.tab || 'General');
  const [formData, setFormData] = useState({});
  const [isLocationModalOpen, setLocationModalOpen] = useState(false);
  const [isShiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [selectedMapLocation, setSelectedMapLocation] = useState(null);
  const [isMapModalOpen, setMapModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [locationForm, setLocationForm] = useState({ name: '', address: '', lat: '', lng: '', radius: 100 });
  const [shiftForm, setShiftForm] = useState({ name: '', startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00', gracePeriod: 15, saturdayType: 'HALF_DAY', saturdayEndTime: '13:00' });

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsAPI.getAll(),
  });

  const { data: locationsData, isLoading: locationsLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: () => settingsAPI.getLocations(),
  });

  const { data: shiftsData, isLoading: shiftsLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => settingsAPI.getShifts(),
  });

  useEffect(() => {
    if (settingsData?.data) {
      setFormData(settingsData.data);
    }
  }, [settingsData]);

  const saveMutation = useMutation({
    mutationFn: (data) => settingsAPI.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      alert('Settings saved successfully!');
      // Reload halaman agar LicenseFooter dan cache lisensi terupdate
      window.location.reload();
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: (id) => settingsAPI.deleteLocation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      alert('Location deleted');
    },
  });

  const createLocationMutation = useMutation({
    mutationFn: (data) => settingsAPI.createLocation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setLocationModalOpen(false);
      alert('Location created successfully!');
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: ({ id, data }) => settingsAPI.updateLocation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] });
      setLocationModalOpen(false);
      alert('Location updated successfully!');
    },
  });

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleInputChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const handleOpenAddModal = () => {
    setEditingLocation(null);
    setLocationForm({ name: '', address: '', lat: '', lng: '', radius: 100 });
    setLocationModalOpen(true);
  };

  const handleOpenEditModal = (loc) => {
    setEditingLocation(loc);
    setLocationForm({ 
      name: loc.name, 
      address: loc.address || '', 
      lat: loc.lat, 
      lng: loc.lng, 
      radius: loc.radius 
    });
    setLocationModalOpen(true);
  };

  const handleOpenMap = (loc) => {
    setSelectedMapLocation(loc);
    setMapModalOpen(true);
  };

  const handleLocationSubmit = (e) => {
    e.preventDefault();
    if (editingLocation) {
      updateLocationMutation.mutate({ id: editingLocation.id, data: locationForm });
    } else {
      createLocationMutation.mutate(locationForm);
    }
  };

  const createShiftMutation = useMutation({
    mutationFn: (data) => settingsAPI.createShift(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setShiftModalOpen(false);
      alert('Shift created successfully!');
    },
  });

  const updateShiftMutation = useMutation({
    mutationFn: ({ id, data }) => settingsAPI.updateShift(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      setShiftModalOpen(false);
      alert('Shift updated successfully!');
    },
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (id) => settingsAPI.deleteShift(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      alert('Shift deleted successfully!');
    },
  });

  const handleShiftSubmit = (e) => {
    e.preventDefault();
    if (editingShift) {
      updateShiftMutation.mutate({ id: editingShift.id, data: shiftForm });
    } else {
      createShiftMutation.mutate(shiftForm);
    }
  };

  const handleOpenEditShift = (shift) => {
    setEditingShift(shift);
    setShiftForm({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakStart: shift.breakStart || '12:00',
      breakEnd: shift.breakEnd || '13:00',
      gracePeriod: shift.gracePeriod,
      saturdayType: shift.saturdayType || 'HALF_DAY',
      saturdayEndTime: shift.saturdayEndTime || '13:00'
    });
    setShiftModalOpen(true);
  };

  const user = authAPI.getStoredUser();

  const hasTabPermission = (tabId) => {
    if (user?.role === 'SUPER_ADMIN' || user?.permissions === 'ALL') {
      return { canRead: true, canCreate: true, canUpdate: true, canDelete: true };
    }
    if (!user?.permissions || !Array.isArray(user.permissions)) {
      return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    }

    const mapping = {
      'General': 'settings-company-profile',
      'Location': 'settings-geofencing',
      'Shifts': 'settings-shift-rules',
      'Calendar': 'settings-calendar',
      'Security': 'settings-biometrics',
      'Cameras': 'settings-cctv',
      'PenaltySettings': 'settings-shift-rules',
      'SlipBuilder': 'settings-slip',
      'AttendanceBuilder': 'settings-report',
      'IDCardBuilder': 'settings-id-card',
      'Permissions': 'settings-permissions',
      'License': 'settings-license'
    };

    const key = mapping[tabId];
    if (!key) return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };

    const perm = user.permissions.find(p => p.menuKey === key);
    return {
      canRead: perm?.canRead || false,
      canCreate: perm?.canCreate || false,
      canUpdate: perm?.canUpdate || false,
      canDelete: perm?.canDelete || false
    };
  };

  const tabs = [
    { id: 'General', icon: Building2, label: 'Company Profile' },
    { id: 'Location', icon: MapPin, label: 'Geofencing' },
    { id: 'Shifts', icon: Clock, label: 'Shift Rules' },
    { id: 'PenaltySettings', icon: AlertCircle, label: 'Penalty Rules' },
    { id: 'Calendar', icon: CalendarCheck, label: 'Calendar & Holidays' },
    { id: 'Security', icon: ShieldCheck, label: 'Biometrics' },
    { id: 'Cameras', icon: CameraIcon, label: 'CCTV AI Cameras' },
    { id: 'SlipBuilder', icon: FileText, label: 'Slip Configuration' },
    { id: 'AttendanceBuilder', icon: CalendarCheck, label: 'Attendance Report' },
    { id: 'IDCardBuilder', icon: CreditCard, label: 'ID Card Template' },
  ];

  if (user?.role === 'SUPER_ADMIN') {
    tabs.push({ id: 'Permissions', icon: Shield, label: 'Hak Akses Admin' });
    tabs.push({ id: 'License', icon: ShieldCheck, label: 'System License' });
  }

  // Filter tabs by canRead permission
  const visibleTabs = tabs.filter(t => {
    if (t.id === 'Permissions' || t.id === 'License') {
      return user?.role === 'SUPER_ADMIN';
    }
    return hasTabPermission(t.id).canRead;
  });

  // Watch for state changes to change the tab
  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
    }
  }, [location.state]);

  // Enforce read permission on activeTab, fallback to first allowed tab
  useEffect(() => {
    if (visibleTabs.length > 0) {
      const isAllowed = visibleTabs.some(t => t.id === activeTab);
      if (!isAllowed) {
        setActiveTab(visibleTabs[0].id);
      }
    }
  }, [visibleTabs, activeTab]);

  if (settingsLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const locations = locationsData?.data || [];
  const shifts = shiftsData?.data || [];

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 text-slate-500">
            <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center">
              <ShieldCheck className="w-3 h-3 text-slate-400" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">{t('settingsPage.categoryAdmin')}</span>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{t('settingsPage.categoryTitle')}</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-4">
            {t('settingsPage.title')}
            <div className="px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {t('settingsPage.tagSecure')}
            </div>
          </h1>
        </div>

        <button 
          onClick={handleSave}
          disabled={saveMutation.isPending || !hasTabPermission(activeTab).canUpdate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-3 disabled:opacity-50 transition-all shadow-sm active:scale-95 min-w-[200px]"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saveMutation.isPending ? t('settingsPage.saving') : t('settingsPage.btnSave')}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-72 shrink-0 lg:sticky lg:top-8">
          <div className="bg-white p-3 border border-slate-200 rounded-2xl shadow-sm space-y-1">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-4 px-5 py-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 group relative overflow-hidden ${
                    isActive 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 transition-transform duration-300 ${isActive ? 'text-blue-600 scale-110' : 'text-slate-400 group-hover:scale-110 group-hover:rotate-6 group-hover:text-blue-500'}`} />
                  <span className="relative z-10">{t('settingsPage.tabs.' + tab.id)}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
                  )}
                </button>
              );
            })}
          </div>
          
          <div className="mt-6 px-6 py-5 bg-blue-50/50 border border-blue-100 rounded-2xl relative overflow-hidden group">
            <div className="relative z-10 space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">{t('settingsPage.sidebar.checkTitle')}</span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium leading-relaxed tracking-wider">
                {t('settingsPage.sidebar.checkDesc')}
              </p>
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {activeTab === 'SlipBuilder' && (
            <SlipTemplateBuilder formData={formData} handleInputChange={handleInputChange} />
          )}

          {activeTab === 'AttendanceBuilder' && (
            <AttendanceTemplateBuilder formData={formData} handleInputChange={handleInputChange} />
          )}

          {activeTab === 'IDCardBuilder' && (
            <IDCardTemplateBuilder formData={formData} handleInputChange={handleInputChange} />
          )}

          {activeTab === 'Cameras' && (
            <SettingsCameras permissions={hasTabPermission('Cameras')} />
          )}

          {activeTab === 'General' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-8 md:p-10 border border-slate-200 rounded-3xl shadow-sm relative overflow-hidden">
                <div className="flex items-center gap-5 mb-10">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 tracking-tight">{t('settingsPage.general.title')}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{t('settingsPage.general.subtitle')}</p>
                  </div>
                </div>

                <div className="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col md:flex-row gap-6 items-center">
                  <div className="h-24 w-auto min-w-[6rem] max-w-[16rem] rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-sm relative group px-4">
                    {formData.appLogo ? (
                      <img src={formData.appLogo} alt="App Logo" className="max-h-full max-w-full object-contain p-2" />
                    ) : (
                      <Building2 className="w-8 h-8 text-slate-300" />
                    )}
                    {formData.appLogo && (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          onClick={() => handleInputChange('appLogo', '')}
                          className="w-8 h-8 rounded-full bg-white/20 hover:bg-rose-500 text-white flex items-center justify-center backdrop-blur-sm transition-colors"
                          title={t('settingsPage.general.removeLogo')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 flex-1 w-full text-center md:text-left">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">{t('settingsPage.general.logoLabel')}</label>
                    <div className="flex flex-wrap items-center gap-3 mt-1.5 justify-center md:justify-start">
                      <input 
                        type="file" 
                        id="logo-upload"
                        accept="image/png, image/jpeg, image/svg+xml"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              alert(t('settingsPage.general.alerts.logoSize'));
                              return;
                            }
                            const reader = new FileReader();
                            reader.onloadend = () => handleInputChange('appLogo', reader.result);
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="hidden"
                      />
                      <label 
                        htmlFor="logo-upload"
                        className="cursor-pointer py-2.5 px-4 rounded-xl text-xs font-bold uppercase tracking-wider bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors inline-block"
                      >
                        {t('settingsPage.general.chooseFileBtn')}
                      </label>
                      <span className="text-xs text-slate-500 font-semibold">
                        {formData.appLogo ? t('settingsPage.general.fileSelected') : t('settingsPage.general.noFileChosen')}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{t('settingsPage.general.logoHelp')}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.general.companyName')}</label>
                    <input 
                      type="text" 
                      value={formData.companyName || ''} 
                      onChange={(e) => handleInputChange('companyName', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.general.companyWebsite')}</label>
                    <input 
                      type="url" 
                      value={formData.companyWebsite || ''} 
                      onChange={(e) => handleInputChange('companyWebsite', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.general.companyEmail')}</label>
                    <input 
                      type="email" 
                      value={formData.companyEmail || ''} 
                      onChange={(e) => handleInputChange('companyEmail', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.general.companyPhone')}</label>
                    <input 
                      type="tel" 
                      value={formData.companyPhone || ''} 
                      onChange={(e) => handleInputChange('companyPhone', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="mt-8 space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.general.companyAddress')}</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 min-h-[120px] resize-none"
                    value={formData.companyAddress || ''}
                    onChange={(e) => handleInputChange('companyAddress', e.target.value)}
                  ></textarea>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Location' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-8 md:p-10 border border-slate-200 shadow-sm rounded-3xl">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 tracking-tight">{t('settingsPage.location.title')}</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{t('settingsPage.location.subtitle')}</p>
                    </div>
                  </div>
                  {hasTabPermission('Location').canCreate && (
                    <button 
                      onClick={handleOpenAddModal}
                      className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> {t('settingsPage.location.newBtn')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-5">
                  {locations.length === 0 ? (
                    <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <MapPin className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.location.empty')}</p>
                    </div>
                  ) : (
                    locations.map((loc) => (
                      <div key={loc.id} className="group relative bg-white border border-slate-200 rounded-2xl p-6 hover:border-blue-300 hover:shadow-md transition-all duration-300">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                          <div className="flex items-start gap-5">
                            <div className="w-14 h-14 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 border border-slate-100 group-hover:border-blue-100 transition-all duration-300">
                              <Target className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                              <h4 className="text-lg font-bold text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors uppercase">{loc.name}</h4>
                              <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-xl">{loc.address}</p>
                              <div className="flex flex-wrap gap-3 mt-3">
                                <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                                  <span className="text-[10px] font-bold text-slate-600 tracking-wider">{loc.lat}, {loc.lng}</span>
                                </div>
                                <div className="flex items-center gap-1.5 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                                  <Target className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-[10px] font-bold text-emerald-700 tracking-wider">{loc.radius}m {t('settingsPage.locationModal.radius')}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleOpenMap(loc)}
                              className="px-4 py-2.5 bg-white hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border border-slate-200 hover:border-blue-200 flex items-center gap-2"
                            >
                              <Globe className="w-3.5 h-3.5" /> {t('settingsPage.location.testMap')}
                            </button>
                            {hasTabPermission('Location').canUpdate && (
                              <button 
                                onClick={() => handleOpenEditModal(loc)}
                                className="w-10 h-10 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg transition-all border border-slate-200 hover:border-blue-200 cursor-pointer"
                                title={t('settingsPage.locationModal.editTitle')}
                              >
                                <Save className="w-4 h-4" />
                              </button>
                            )}
                            {hasTabPermission('Location').canDelete && (
                              <button 
                                onClick={() => { if(confirm(t('settingsPage.location.alerts.deleteConfirm'))) deleteLocationMutation.mutate(loc.id) }}
                                className="w-10 h-10 flex items-center justify-center bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all border border-slate-200 hover:border-rose-200 cursor-pointer"
                                title={t('settingsPage.location.alerts.deleteConfirm')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-white p-8 md:p-10 border border-slate-200 shadow-sm rounded-3xl">
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight">{t('settingsPage.location.protocols')}</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:border-blue-200 transition-all duration-300">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-800 tracking-tight">{t('settingsPage.location.strictTitle')}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t('settingsPage.location.strictDesc')}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formData.strictGeofencing === 'true'} 
                        onChange={(e) => handleInputChange('strictGeofencing', String(e.target.checked))}
                      />
                      <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Calendar' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-8 md:p-10 border border-slate-200 shadow-sm rounded-3xl">
                <CompanyCalendarSettings permissions={hasTabPermission('Calendar')} />
              </div>
            </div>
          )}

          {activeTab === 'PenaltySettings' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-8 md:p-10 border border-slate-200 shadow-sm rounded-3xl">
                <PenaltySettings formData={formData} handleInputChange={handleInputChange} permissions={hasTabPermission('Shifts')} />
              </div>
            </div>
          )}
          
          {activeTab === 'Shifts' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-8 md:p-10 border border-slate-200 shadow-sm rounded-3xl">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-slate-800 tracking-tight">{t('settingsPage.shifts.title')}</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{t('settingsPage.shifts.subtitle')}</p>
                    </div>
                  </div>
                  {hasTabPermission('Shifts').canCreate && (
                    <button 
                      onClick={() => { setShiftForm({ name: '', startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00', gracePeriod: 15, saturdayType: 'HALF_DAY', saturdayEndTime: '13:00' }); setShiftModalOpen(true); }}
                      className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
                    >
                      <Plus className="w-4 h-4" /> {t('settingsPage.shifts.newBtn')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {shifts.map(shift => {
                    const departments = Array.from(new Set(
                      shift.employees
                        ?.map(e => e.department?.name)
                        .filter(Boolean)
                    ));
                    return (
                      <div key={shift.id} className="group relative bg-white border border-slate-200 rounded-2xl p-6 hover:border-blue-300 hover:shadow-md transition-all duration-300">
                        <div className="flex justify-between items-start mb-5">
                          <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 border border-slate-100 group-hover:border-blue-100 transition-all duration-300">
                            <Clock className="w-6 h-6" />
                          </div>
                          <div className="flex gap-2">
                            {hasTabPermission('Shifts').canUpdate && (
                              <button 
                                onClick={() => handleOpenEditShift(shift)}
                                title={t('settingsPage.shiftModal.editTitle')}
                                className="w-9 h-9 flex items-center justify-center bg-white hover:bg-slate-50 text-slate-400 hover:text-blue-600 rounded-lg transition-all border border-slate-200 hover:border-blue-200 cursor-pointer"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            {hasTabPermission('Shifts').canDelete && (
                              <button 
                                onClick={() => { if(confirm(t('settingsPage.shifts.alerts.deleteConfirm'))) deleteShiftMutation.mutate(shift.id) }}
                                className="w-9 h-9 flex items-center justify-center bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all border border-slate-200 hover:border-rose-200 cursor-pointer"
                                title={t('settingsPage.shifts.alerts.deleteConfirm')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <h4 className="text-base font-bold text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors uppercase mb-4">{shift.name}</h4>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-lg border border-slate-100">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t('settingsPage.shifts.span')}</span>
                            <span className="text-xs font-bold text-slate-700">{shift.startTime} <span className="text-slate-400 mx-1">—</span> {shift.endTime}</span>
                          </div>
                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-lg border border-slate-100">
                             <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t('settingsPage.shifts.grace')}</span>
                             <span className="text-xs font-bold text-amber-600">{shift.gracePeriod}m PROTOCOL</span>
                           </div>
                           <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-lg border border-slate-100">
                             <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t('settingsPage.shifts.saturday')}</span>
                             <span className="text-xs font-bold text-indigo-600 uppercase">
                               {
                                 shift.saturdayType === 'OFF' ? t('settingsPage.shifts.saturdayTypes.OFF') :
                                 shift.saturdayType === 'FULL_DAY' ? t('settingsPage.shifts.saturdayTypes.FULL_DAY') :
                                 `${t('settingsPage.shifts.saturdayTypes.HALF_DAY')} (${shift.saturdayEndTime || '13:00'})`
                               }
                             </span>
                           </div>
                          <div className="flex flex-wrap gap-2 pt-2 items-center">
                            <div className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[9px] font-bold uppercase tracking-widest rounded-md border border-emerald-100">
                              {shift._count?.employees || 0} {t('settingsPage.license.personnel')}
                            </div>
                            {departments.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {departments.map(dept => (
                                  <span key={dept} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[9px] font-bold uppercase tracking-wider rounded-md border border-blue-100">
                                    {dept}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {shifts.length === 0 && (
                    <div className="col-span-1 md:col-span-2 py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.shifts.empty')}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white p-8 md:p-10 border border-slate-200 shadow-sm rounded-3xl">
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                    <CalendarCheck className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight">{t('settingsPage.shifts.matrix')}</h3>
                </div>
                
                <div className="flex flex-wrap gap-3">
                  {[
                    { id: 0, label: weekdayNames[0]?.toUpperCase() || 'SUN' },
                    { id: 1, label: weekdayNames[1]?.toUpperCase() || 'MON' },
                    { id: 2, label: weekdayNames[2]?.toUpperCase() || 'TUE' },
                    { id: 3, label: weekdayNames[3]?.toUpperCase() || 'WED' },
                    { id: 4, label: weekdayNames[4]?.toUpperCase() || 'THU' },
                    { id: 5, label: weekdayNames[5]?.toUpperCase() || 'FRI' },
                    { id: 6, label: weekdayNames[6]?.toUpperCase() || 'SAT' },
                  ].map((day) => {
                    const workingDays = JSON.parse(formData.workingDays || '[1,2,3,4,5]');
                    const isSelected = workingDays.includes(day.id);
                    return (
                      <button
                        key={day.id}
                        onClick={() => {
                          const newDays = isSelected 
                            ? workingDays.filter(d => d !== day.id)
                            : [...workingDays, day.id].sort();
                          handleInputChange('workingDays', JSON.stringify(newDays));
                        }}
                        className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-2 border transition-all duration-300 ${
                          isSelected 
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20 scale-105' 
                            : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300 hover:text-slate-800'
                        }`}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider">{day.label}</span>
                        {isSelected ? (
                          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        ) : (
                          <div className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white p-8 md:p-10 border border-slate-200 shadow-sm rounded-3xl">
                <div className="flex items-center gap-5 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                    <Clock className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight">{t('settingsPage.shifts.satRules')}</h3>
                </div>
                
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:border-blue-200 transition-all duration-300">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-800 tracking-tight">{t('settingsPage.shifts.satHalf')}</p>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t('settingsPage.shifts.satHalfDesc')}</p>
                    </div>
                    <label className="relative inline-flex inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formData.saturdayHalfDay === 'true'} 
                        onChange={(e) => handleInputChange('saturdayHalfDay', String(e.target.checked))}
                      />
                      <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  
                  {formData.saturdayHalfDay === 'true' && (
                    <div className="flex items-center justify-between p-6 bg-slate-50 border border-slate-100 rounded-2xl transition-all duration-300 animate-in fade-in">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-800 tracking-tight">{t('settingsPage.shifts.satDeadline')}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t('settingsPage.shifts.satExpected')}</p>
                      </div>
                      <input
                        type="time"
                        value={formData.saturdayCheckoutTime || '13:00'}
                        onChange={(e) => handleInputChange('saturdayCheckoutTime', e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <div className="bg-white p-8 border border-slate-200 shadow-sm rounded-3xl">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-6 border-l-4 border-blue-500 pl-4">{t('settingsPage.shifts.compliance')}</h3>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shifts.cutoff')}</label>
                      <input 
                        type="number" 
                        min="0"
                        max="31"
                        placeholder="e.g. 25 (0 for End of Month)"
                        value={formData.payrollCutoffDate || '0'} 
                        onChange={(e) => handleInputChange('payrollCutoffDate', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                      <p className="text-[10px] text-slate-400 ml-1">{t('settingsPage.shifts.cutoffHelp')}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shifts.graceMin')}</label>
                      <input 
                        type="number" 
                        value={formData.gracePeriod || 15} 
                        onChange={(e) => handleInputChange('gracePeriod', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shifts.timezone')}</label>
                      <input 
                        type="number" 
                        value={formData.timezoneOffset || 420} 
                        onChange={(e) => handleInputChange('timezoneOffset', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                      <p className="text-[10px] text-slate-400 ml-1">{t('settingsPage.shifts.timezoneHelp')}</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shifts.autoCheckout')}</label>
                      <input 
                        type="time" 
                        value={formData.autoCheckoutTime || '23:59'} 
                        onChange={(e) => handleInputChange('autoCheckoutTime', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white p-8 border border-slate-200 shadow-sm rounded-3xl">
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest mb-6 border-l-4 border-amber-500 pl-4">{t('settingsPage.shifts.otIntel')}</h3>
                  
                  <div className="space-y-4 mb-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shifts.otMaxDay')}</label>
                      <input 
                        type="number" 
                        value={formData.overtimeMaxPerDay || 4} 
                        onChange={(e) => handleInputChange('overtimeMaxPerDay', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shifts.otMaxMonth')}</label>
                      <input 
                        type="number" 
                        value={formData.overtimeMaxPerMonth || 40} 
                        onChange={(e) => handleInputChange('overtimeMaxPerMonth', e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-5 py-3.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:border-blue-200 transition-all duration-300">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                        <Bell className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-800 tracking-tight">{t('settingsPage.shifts.otNotify')}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t('settingsPage.shifts.otNotifyDesc')}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formData.otNotification === 'true'}
                        onChange={(e) => handleInputChange('otNotification', String(e.target.checked))}
                      />
                      <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                  
                  <div className="flex items-center justify-between p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:border-blue-200 transition-all duration-300 mt-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-800 tracking-tight">{t('settingsPage.shifts.otAuto')}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t('settingsPage.shifts.otAutoDesc')}</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formData.autoCalculateOvertime !== 'false'}
                        onChange={(e) => handleInputChange('autoCalculateOvertime', String(e.target.checked))}
                      />
                      <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Security' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-8 md:p-10 border border-slate-200 shadow-sm rounded-3xl relative overflow-hidden">
                <div className="flex items-center gap-5 mb-10">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 tracking-tight">{t('settingsPage.security.title')}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{t('settingsPage.security.subtitle')}</p>
                  </div>
                </div>

                <div className="space-y-10">
                  <div className="space-y-4">
                    <div className="flex justify-between items-end px-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.security.match')}</label>
                        <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-tight">{t('settingsPage.security.matchDesc')}</p>
                      </div>
                      <span className="text-xl font-bold text-blue-600 tabular-nums">{formData.faceMatchThreshold || 85}%</span>
                    </div>
                    <div className="relative h-8 flex items-center">
                      <div className="absolute inset-0 bg-slate-50 rounded-full border border-slate-200" />
                      <input 
                        type="range" 
                        min="50" 
                        max="100" 
                        value={formData.faceMatchThreshold || 85}
                        onChange={(e) => handleInputChange('faceMatchThreshold', e.target.value)}
                        className="relative z-10 w-full h-1 bg-transparent appearance-none cursor-pointer accent-blue-600 px-4"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">


                    <div className="flex items-center justify-between p-6 bg-slate-50 border border-slate-100 rounded-2xl hover:border-blue-200 transition-all duration-300">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-slate-800 tracking-tight">{t('settingsPage.security.autoEnroll')}</p>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{t('settingsPage.security.autoEnrollDesc')}</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          className="sr-only peer" 
                          checked={formData.autoEnrollment === 'true'}
                          onChange={(e) => handleInputChange('autoEnrollment', String(e.target.checked))}
                        />
                        <div className="w-12 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-3xl flex flex-col md:flex-row gap-6 items-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <div className="space-y-2 text-center md:text-left">
                  <h4 className="text-base font-bold text-emerald-900 tracking-tight">{t('settingsPage.security.encryption')}</h4>
                  <p className="text-xs text-emerald-700 font-medium leading-relaxed">
                    {t('settingsPage.security.encryptionDesc').split('ISO/IEC 27001')[0]}
                    <span className="font-bold">ISO/IEC 27001</span>
                  </p>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'Permissions' && (
            <AdminPermissions />
          )}

          {activeTab === 'License' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-8 md:p-10 border border-slate-200 rounded-3xl shadow-sm relative overflow-hidden">
                <div className="flex items-center gap-5 mb-10">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-800 tracking-tight">{t('settingsPage.license.title')}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">{t('settingsPage.license.subtitle')}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.license.key')}</label>
                  <textarea 
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-5 text-sm font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all placeholder:text-slate-400 min-h-[120px] resize-none"
                    value={formData.licenseKey || ''}
                    onChange={(e) => handleInputChange('licenseKey', e.target.value)}
                    placeholder={t('settingsPage.license.placeholder')}
                  ></textarea>
                  
                  {(() => {
                    if (!formData.licenseKey) return null;
                    try {
                      const parts = formData.licenseKey.split('.');
                      if (parts.length !== 2) throw new Error();
                      const payload = JSON.parse(atob(parts[0]));
                      const isExpired = new Date() > new Date(payload.expiry);
                      return (
                        <div className={`mt-6 p-6 rounded-2xl border ${isExpired ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                          <div className="flex items-center gap-3 mb-4">
                            {isExpired ? <AlertCircle className="w-6 h-6 text-red-600" /> : <CheckCircle2 className="w-6 h-6 text-emerald-600" />}
                            <h4 className={`text-sm font-bold ${isExpired ? 'text-red-900' : 'text-emerald-900'}`}>
                              {isExpired ? t('settingsPage.license.expired') : t('settingsPage.license.valid')}
                            </h4>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">{t('settingsPage.license.to')}</p>
                              <p className="text-sm font-semibold text-slate-800">{payload.client}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">{t('settingsPage.license.expiry')}</p>
                              <p className={`text-sm font-semibold ${isExpired ? 'text-red-600' : 'text-slate-800'}`}>{payload.expiry}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">{t('settingsPage.license.limit')}</p>
                              <p className="text-sm font-semibold text-slate-800">{payload.limit} {t('settingsPage.license.personnel')}</p>
                            </div>
                          </div>
                        </div>
                      );
                    } catch (err) {
                      return (
                        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm flex items-center gap-3">
                          <AlertCircle className="w-5 h-5" />
                          {t('settingsPage.license.invalid')}
                        </div>
                      );
                    }
                  })()}
                  
                  <p className="text-xs text-slate-500 mt-2">
                    {t('settingsPage.license.help')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      
      {/* Location Modal */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setLocationModalOpen(false)}></div>
          <div className="bg-white shadow-2xl w-full max-w-xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 rounded-3xl">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                    {editingLocation ? t('settingsPage.locationModal.editTitle') : t('settingsPage.locationModal.addTitle')}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{t('settingsPage.locationModal.subtitle')}</p>
                </div>
              </div>
              <button onClick={() => setLocationModalOpen(false)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-200 rounded-lg transition-colors text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleLocationSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.locationModal.name')}</label>
                <input 
                  type="text" 
                  required
                  value={locationForm.name}
                  onChange={(e) => setLocationForm({...locationForm, name: e.target.value})}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                  placeholder={t('settingsPage.locationModal.namePlaceholder')}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.locationModal.address')}</label>
                <input 
                  type="text" 
                  value={locationForm.address}
                  onChange={(e) => setLocationForm({...locationForm, address: e.target.value})}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                  placeholder={t('settingsPage.locationModal.addressPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.locationModal.lat')}</label>
                  <input 
                    type="number" 
                    step="any"
                    required
                    value={locationForm.lat}
                    onChange={(e) => setLocationForm({...locationForm, lat: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                    placeholder="-6.XXXX"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.locationModal.lng')}</label>
                  <input 
                    type="number" 
                    step="any"
                    required
                    value={locationForm.lng}
                    onChange={(e) => setLocationForm({...locationForm, lng: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                    placeholder="106.XXXX"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end px-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.locationModal.radius')}</label>
                  <span className="text-lg font-bold text-blue-600 tabular-nums">{locationForm.radius}m</span>
                </div>
                <div className="relative h-8 flex items-center">
                  <div className="absolute inset-0 bg-slate-50 rounded-full border border-slate-200" />
                  <input 
                    type="range" 
                    min="50" 
                    max="1000" 
                    step="50"
                    value={locationForm.radius}
                    onChange={(e) => setLocationForm({...locationForm, radius: parseInt(e.target.value)})}
                    className="relative z-10 w-full h-1 bg-transparent appearance-none cursor-pointer accent-blue-600 px-4"
                  />
                </div>
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setLocationModalOpen(false)}
                  className="flex-1 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-all"
                >
                  {t('settingsPage.locationModal.cancel')}
                </button>
                <button 
                  type="submit"
                  disabled={createLocationMutation.isPending || updateLocationMutation.isPending}
                  className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-sm"
                >
                  {createLocationMutation.isPending || updateLocationMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('settingsPage.locationModal.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Shift Modal */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setShiftModalOpen(false)}></div>
          <div className="bg-white shadow-2xl w-full max-w-xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 rounded-3xl">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight">
                    {editingShift ? t('settingsPage.shiftModal.editTitle') : t('settingsPage.shiftModal.addTitle')}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{t('settingsPage.shiftModal.subtitle')}</p>
                </div>
              </div>
              <button onClick={() => setShiftModalOpen(false)} className="w-8 h-8 flex items-center justify-center hover:bg-slate-200 rounded-lg transition-colors text-slate-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleShiftSubmit} className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shiftModal.name')}</label>
                <input 
                  type="text" 
                  required
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({...shiftForm, name: e.target.value})}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                  placeholder={t('settingsPage.shiftModal.namePlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shiftModal.start')}</label>
                  <input 
                    type="time" 
                    required
                    value={shiftForm.startTime}
                    onChange={(e) => setShiftForm({...shiftForm, startTime: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shiftModal.end')}</label>
                  <input 
                    type="time" 
                    required
                    value={shiftForm.endTime}
                    onChange={(e) => setShiftForm({...shiftForm, endTime: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shiftModal.breakStart')}</label>
                  <input 
                    type="time" 
                    value={shiftForm.breakStart}
                    onChange={(e) => setShiftForm({...shiftForm, breakStart: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shiftModal.breakEnd')}</label>
                  <input 
                    type="time" 
                    value={shiftForm.breakEnd}
                    onChange={(e) => setShiftForm({...shiftForm, breakEnd: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shiftModal.grace')}</label>
                <input 
                  type="number" 
                  value={shiftForm.gracePeriod}
                  onChange={(e) => setShiftForm({...shiftForm, gracePeriod: parseInt(e.target.value)})}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shiftModal.saturday')}</label>
                  <select 
                    value={shiftForm.saturdayType || 'HALF_DAY'}
                    onChange={(e) => setShiftForm({...shiftForm, saturdayType: e.target.value})}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
                  >
                    <option value="HALF_DAY">{t('settingsPage.shiftModal.saturdayOptions.HALF_DAY')}</option>
                    <option value="FULL_DAY">{t('settingsPage.shiftModal.saturdayOptions.FULL_DAY')}</option>
                    <option value="OFF">{t('settingsPage.shiftModal.saturdayOptions.OFF')}</option>
                  </select>
                </div>
                {(shiftForm.saturdayType || 'HALF_DAY') === 'HALF_DAY' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">{t('settingsPage.shiftModal.saturdayEnd')}</label>
                    <input 
                      type="time" 
                      required={(shiftForm.saturdayType || 'HALF_DAY') === 'HALF_DAY'}
                      value={shiftForm.saturdayEndTime || '13:00'}
                      onChange={(e) => setShiftForm({...shiftForm, saturdayEndTime: e.target.value})}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm animate-in slide-in-from-top-2 duration-200"
                    />
                  </div>
                )}
              </div>
              
              <div className="flex gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button"
                  onClick={() => setShiftModalOpen(false)}
                  className="flex-1 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-800 hover:bg-slate-50 rounded-xl transition-all"
                >
                  {t('settingsPage.shiftModal.cancel')}
                </button>
                <button 
                  type="submit"
                  disabled={createShiftMutation.isPending || updateShiftMutation.isPending}
                  className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-xs font-bold tracking-wider uppercase flex items-center justify-center gap-2 disabled:opacity-50 transition-all shadow-sm"
                >
                  {createShiftMutation.isPending || updateShiftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('settingsPage.shiftModal.submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Map Modal */}
      {isMapModalOpen && (
        <LocationMapModal 
          isOpen={isMapModalOpen} 
          onClose={() => setMapModalOpen(false)} 
          location={selectedMapLocation} 
        />
      )}
    </div>
  );
};

export default Settings;
