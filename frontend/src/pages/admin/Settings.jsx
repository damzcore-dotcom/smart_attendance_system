import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
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
  X
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsAPI } from '../../services/api';
import LocationMapModal from '../../components/modals/LocationMapModal';

const Settings = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.tab || 'Location');
  const [formData, setFormData] = useState({});
  const [isLocationModalOpen, setLocationModalOpen] = useState(false);
  const [isShiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  const [selectedMapLocation, setSelectedMapLocation] = useState(null);
  const [isMapModalOpen, setMapModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [locationForm, setLocationForm] = useState({ name: '', address: '', lat: '', lng: '', radius: 100 });
  const [shiftForm, setShiftForm] = useState({ name: '', startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00', gracePeriod: 15 });

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
      gracePeriod: shift.gracePeriod
    });
    setShiftModalOpen(true);
  };

  const tabs = [
    { id: 'General', icon: Building2, label: 'Company Profile' },
    { id: 'Location', icon: MapPin, label: 'Geofencing' },
    { id: 'Shifts', icon: Clock, label: 'Shift Rules' },
    { id: 'Security', icon: ShieldCheck, label: 'Biometrics' },
  ];

  if (settingsLoading || locationsLoading || shiftsLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
      </div>
    );
  }

  const locations = locationsData?.data || [];
  const shifts = shiftsData?.data || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">System Settings</h1>
          <p className="text-slate-500 mt-1">Configure global rules and office locations.</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="btn-primary flex items-center gap-2 px-6 disabled:opacity-70"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Tabs */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="card p-2 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                    activeTab === tab.id 
                      ? 'bg-primary text-white shadow-md shadow-primary/20' 
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1">
          {activeTab === 'General' && (
            <div className="card p-6 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <h3 className="font-bold text-slate-800 mb-6">Company Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Company Name</label>
                    <input 
                      type="text" 
                      value={formData.companyName || ''} 
                      onChange={(e) => handleInputChange('companyName', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Website URL</label>
                    <input 
                      type="url" 
                      value={formData.companyWebsite || ''} 
                      onChange={(e) => handleInputChange('companyWebsite', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Business Email</label>
                    <input 
                      type="email" 
                      value={formData.companyEmail || ''} 
                      onChange={(e) => handleInputChange('companyEmail', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Phone Number</label>
                    <input 
                      type="tel" 
                      value={formData.companyPhone || ''} 
                      onChange={(e) => handleInputChange('companyPhone', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Company Address</label>
                <textarea 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px]"
                  value={formData.companyAddress || ''}
                  onChange={(e) => handleInputChange('companyAddress', e.target.value)}
                ></textarea>
              </div>
            </div>
          )}

          {activeTab === 'Location' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="card p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="font-bold text-slate-800">Office Locations</h3>
                    <p className="text-sm text-slate-500">Define geofence boundaries for attendance validation.</p>
                  </div>
                  <button 
                    onClick={handleOpenAddModal}
                    className="flex items-center gap-2 bg-primary/5 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/10 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add New Location
                  </button>
                </div>

                <div className="space-y-4">
                  {locations.length === 0 ? (
                    <p className="text-center text-slate-400 py-8 text-sm">No locations defined.</p>
                  ) : (
                    locations.map((loc) => (
                      <div key={loc.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 border border-slate-100 rounded-2xl hover:border-primary/20 transition-colors group">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                            <MapPin className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-800">{loc.name}</h4>
                            <p className="text-xs text-slate-400">{loc.address}</p>
                            <div className="flex gap-4 mt-2">
                              <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1 bg-slate-50 px-2 py-0.5 rounded">
                                <Globe className="w-3 h-3" /> {loc.lat}, {loc.lng}
                              </span>
                              <span className="text-[10px] font-bold text-primary flex items-center gap-1 bg-primary/5 px-2 py-0.5 rounded">
                                <Target className="w-3 h-3" /> {loc.radius}m Radius
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4 md:mt-0">
                          <button 
                            onClick={() => handleOpenMap(loc)}
                            className="p-2 text-primary hover:bg-primary/5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all"
                          >
                            <Globe className="w-3.5 h-3.5" />
                            Test Location
                          </button>
                          <button 
                            onClick={() => handleOpenEditModal(loc)}
                            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button 
                            onClick={() => { if(confirm('Delete location?')) deleteLocationMutation.mutate(loc.id) }}
                            className="p-2 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card p-6">
                <h3 className="font-bold text-slate-800 mb-4">Global Geofencing Rules</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Strict Geofencing</p>
                      <p className="text-xs text-slate-500">Only allow check-in/out within the defined radius.</p>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formData.strictGeofencing === 'true'} 
                        onChange={(e) => handleInputChange('strictGeofencing', String(e.target.checked))}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Shifts' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="card p-6">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="font-bold text-slate-800">Shift Schedules</h3>
                    <p className="text-sm text-slate-500">Define working hours and standard check-in times.</p>
                  </div>
                  <button 
                    onClick={() => { setShiftForm({ name: '', startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00', gracePeriod: 15 }); setShiftModalOpen(true); }}
                    className="flex items-center gap-2 bg-primary/5 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/10 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create Shift
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {shifts.map(shift => (
                    <div key={shift.id} className="p-4 border border-slate-100 rounded-2xl hover:border-primary/20 transition-all bg-slate-50/30 group">
                      <div className="flex justify-between items-start mb-3">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-primary border border-slate-100 shadow-sm group-hover:scale-110 transition-transform">
                          <Clock className="w-5 h-5" />
                        </div>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleOpenEditShift(shift)}
                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-white rounded-lg transition-colors"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => { if(confirm('Delete shift?')) deleteShiftMutation.mutate(shift.id) }}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <h4 className="font-bold text-slate-800 mb-1">{shift.name}</h4>
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>Start: <b className="text-slate-700">{shift.startTime}</b></span>
                          <span className="text-slate-300 mx-1">|</span>
                          <span>End: <b className="text-slate-700">{shift.endTime}</b></span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Grace Period: <b className="text-slate-600">{shift.gracePeriod} min</b></span>
                          <span className="ml-auto font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                            {shift._count?.employees || 0} Emp
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {shifts.length === 0 && (
                    <div className="col-span-2 py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                      <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-400">No shifts defined yet.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="card p-6">
                <h3 className="font-bold text-slate-800 mb-6">Global Attendance Policy</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Default Grace Period (Minutes)</label>
                    <input 
                      type="number" 
                      value={formData.gracePeriod || 15} 
                      onChange={(e) => handleInputChange('gracePeriod', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-[10px] text-slate-400">Fallback tolerance if employee has no assigned shift.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Auto Check-out Time</label>
                    <input 
                      type="time" 
                      value={formData.autoCheckoutTime || '23:59'} 
                      onChange={(e) => handleInputChange('autoCheckoutTime', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-[10px] text-slate-400">System will automatically check-out forgotten logs at this time.</p>
                  </div>
                </div>
              </div>

              <div className="card p-6">
                <h3 className="font-bold text-slate-800 mb-6">Overtime Rules</h3>
                <div className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <Bell className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-bold text-slate-700">OT Notification</p>
                      <p className="text-xs text-slate-500">Notify HR when employee works more than 9 hours.</p>
                    </div>
                  </div>
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={formData.otNotification === 'true'}
                      onChange={(e) => handleInputChange('otNotification', String(e.target.checked))}
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Security' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="card p-6">
                <h3 className="font-bold text-slate-800 mb-6">Biometric Configuration</h3>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Face Match Threshold (%)</label>
                      <span className="text-sm font-black text-primary">{formData.faceMatchThreshold || 85}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="50" 
                      max="100" 
                      value={formData.faceMatchThreshold || 85}
                      onChange={(e) => handleInputChange('faceMatchThreshold', e.target.value)}
                      className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <p className="text-[10px] text-slate-400">Higher threshold increases security but may cause more false rejections.</p>
                  </div>

                  <div className="h-[1px] bg-slate-50"></div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Liveness Detection</p>
                      <p className="text-xs text-slate-500">Require eye blinking or head movement to prevent photo-based spoofs.</p>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formData.livenessDetection === 'true'}
                        onChange={(e) => handleInputChange('livenessDetection', String(e.target.checked))}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Auto-Enrollment</p>
                      <p className="text-xs text-slate-500">Automatically update face template on high-confidence matches.</p>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={formData.autoEnrollment === 'true'}
                        onChange={(e) => handleInputChange('autoEnrollment', String(e.target.checked))}
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2rem] flex gap-4">
                <ShieldCheck className="w-8 h-8 text-emerald-500 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-emerald-800 mb-1">Enterprise Grade Encryption</h4>
                  <p className="text-xs text-emerald-600 leading-relaxed">
                    Biometric templates are encrypted using AES-256 and stored as non-reversible mathematical hashes. Actual face images are never stored in the database.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Location Modal */}
      {isLocationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setLocationModalOpen(false)}></div>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" />
                {editingLocation ? 'Edit Office Location' : 'Add New Location'}
              </h3>
              <button onClick={() => setLocationModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <form onSubmit={handleLocationSubmit}>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Location Name</label>
                  <input 
                    type="text" 
                    required
                    value={locationForm.name}
                    onChange={(e) => setLocationForm({...locationForm, name: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="e.g. Headquarters, Factory A"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Address</label>
                  <input 
                    type="text" 
                    value={locationForm.address}
                    onChange={(e) => setLocationForm({...locationForm, address: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Full street address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Latitude</label>
                    <input 
                      type="number" 
                      step="any"
                      required
                      value={locationForm.lat}
                      onChange={(e) => setLocationForm({...locationForm, lat: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="-6.1234"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Longitude</label>
                    <input 
                      type="number" 
                      step="any"
                      required
                      value={locationForm.lng}
                      onChange={(e) => setLocationForm({...locationForm, lng: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="106.1234"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Geofence Radius (meters)</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="50" 
                      max="1000" 
                      step="50"
                      value={locationForm.radius}
                      onChange={(e) => setLocationForm({...locationForm, radius: parseInt(e.target.value)})}
                      className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <span className="text-sm font-black text-primary w-12">{locationForm.radius}m</span>
                  </div>
                </div>
              </div>
              
              <div className="p-6 bg-slate-50/50 border-t border-slate-50 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setLocationModalOpen(false)}
                  className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={createLocationMutation.isPending || updateLocationMutation.isPending}
                  className="flex-1 py-3 bg-primary text-white text-sm font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-70"
                >
                  {createLocationMutation.isPending || updateLocationMutation.isPending ? 'Saving...' : 'Save Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Shift Modal */}
      {isShiftModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShiftModalOpen(false)}></div>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                {editingShift ? 'Edit Shift Schedule' : 'Create New Shift'}
              </h3>
              <button onClick={() => setShiftModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            
            <form onSubmit={handleShiftSubmit}>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shift Name</label>
                  <input 
                    type="text" 
                    required
                    value={shiftForm.name}
                    onChange={(e) => setShiftForm({...shiftForm, name: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="e.g. Regular Shift, Morning"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Start Time</label>
                    <input 
                      type="time" 
                      required
                      value={shiftForm.startTime}
                      onChange={(e) => setShiftForm({...shiftForm, startTime: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">End Time</label>
                    <input 
                      type="time" 
                      required
                      value={shiftForm.endTime}
                      onChange={(e) => setShiftForm({...shiftForm, endTime: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Break Start</label>
                    <input 
                      type="time" 
                      value={shiftForm.breakStart}
                      onChange={(e) => setShiftForm({...shiftForm, breakStart: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Break End</label>
                    <input 
                      type="time" 
                      value={shiftForm.breakEnd}
                      onChange={(e) => setShiftForm({...shiftForm, breakEnd: e.target.value})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Grace Period (Minutes)</label>
                  <input 
                    type="number" 
                    value={shiftForm.gracePeriod}
                    onChange={(e) => setShiftForm({...shiftForm, gracePeriod: parseInt(e.target.value)})}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
              
              <div className="p-6 bg-slate-50/50 border-t border-slate-50 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShiftModalOpen(false)}
                  className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={createShiftMutation.isPending}
                  className="flex-1 py-3 bg-primary text-white text-sm font-bold rounded-xl shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-70"
                >
                  {createShiftMutation.isPending ? 'Creating...' : 'Create Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Map Preview Modal */}
      <LocationMapModal 
        isOpen={isMapModalOpen}
        onClose={() => setMapModalOpen(false)}
        location={selectedMapLocation}
      />
    </div>
  );
};

export default Settings;

