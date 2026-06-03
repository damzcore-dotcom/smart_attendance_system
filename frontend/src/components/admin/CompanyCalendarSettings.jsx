import { useState } from 'react';
import { Calendar, Save, Plus, Trash2, Loader2, AlertCircle, Edit, Sparkles, CheckCircle2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { calendarAPI, settingsAPI } from '../../services/api';
import { getNationalHoliday, getNationalHolidaysForMonth } from '../../utils/nationalHolidays';


const CompanyCalendarSettings = ({ permissions = { canCreate: true, canUpdate: true, canDelete: true } }) => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [currentYear] = useState(new Date().getFullYear());
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [activeView, setActiveView] = useState('grid'); // 'grid' | 'list'

  const todayObj = new Date();
  const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth()+1).padStart(2,'0')}-${String(todayObj.getDate()).padStart(2,'0')}`;

  const [form, setForm] = useState({ date: '', swapDate: '', type: 'HOLIDAY', description: '' });
  const [editingId, setEditingId] = useState(null);

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsAPI.getAll(),
  });

  const settingsList = settingsData?.data || {};
  let workingDays = [1, 2, 3, 4, 5];
  try {
    if (settingsList.workingDays) {
      workingDays = JSON.parse(settingsList.workingDays);
    }
  } catch (e) {}

  const { data: calendarData, isLoading } = useQuery({
    queryKey: ['calendar', selectedYear, selectedMonth],
    queryFn: () => calendarAPI.getAll({ year: selectedYear, month: selectedMonth }),
  });

  const upsertMutation = useMutation({
    mutationFn: (data) => calendarAPI.upsert(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      setForm({ date: '', swapDate: '', type: 'HOLIDAY', description: '' });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => calendarAPI.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      setEditingId(null);
      setForm({ date: '', swapDate: '', type: 'HOLIDAY', description: '' });
    },
  });

  const handleUpsert = async (e) => {
    e.preventDefault();
    if (!form.date || !form.description) return alert(t('settingsPage.calendar.alertCompleteData'));
    
    if (form.type === 'WORKDAY') {
      if (!form.swapDate) return alert(t('settingsPage.calendar.alertSwapDateRequired'));
      try {
        const workdayDesc = `Tukar Hari (Wajib Masuk): ${form.description} (Diganti ke ${form.swapDate})`;
        const holidayDesc = `Tukar Hari (Libur Pengganti): ${form.description} (Dari ${form.date})`;
        
        await calendarAPI.upsert({ date: form.date, type: 'WORKDAY', description: workdayDesc });
        await calendarAPI.upsert({ date: form.swapDate, type: 'HOLIDAY', description: holidayDesc });
        
        queryClient.invalidateQueries({ queryKey: ['calendar'] });
        setForm({ date: '', swapDate: '', type: 'HOLIDAY', description: '' });
        alert(t('settingsPage.calendar.alertSwapSuccess'));
      } catch (err) {
        alert(t('settingsPage.calendar.alertSwapFailed') + err.message);
      }
    } else {
      upsertMutation.mutate(form);
    }
  };

  const handleEdit = (holiday) => {
    const dateStr = holiday.date.split('T')[0];
    setEditingId(holiday.id);
    setForm({
      date: dateStr,
      swapDate: '',
      type: holiday.type,
      description: holiday.description
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm({ date: '', swapDate: '', type: 'HOLIDAY', description: '' });
  };

  const handleDeleteFromForm = () => {
    if (!editingId) return;
    if (confirm(t('settingsPage.calendar.alertDeleteConfirm'))) {
      deleteMutation.mutate(editingId);
    }
  };

  const parseLocalDateString = (dateStr) => {
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(i18n.language, { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  };

  const getDaysInMonth = (year, month) => {
    const firstDay = new Date(year, month - 1, 1);
    const days = [];
    const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Pad initial days of the week from the previous month
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }
    
    const lastDay = new Date(year, month, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      days.push(new Date(year, month - 1, d));
    }
    
    return days;
  };

  const holidays = calendarData?.data || [];
  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);
  const weekdayNamesObj = t('settingsPage.calendar.weekdayNames', { returnObjects: true });
  const weekdayNames = Array.isArray(weekdayNamesObj) ? weekdayNamesObj : ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 font-medium leading-relaxed">
          {t('settingsPage.calendar.warningBanner')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Form & Suggestions Panel */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4 text-sm">
              {editingId ? (
                <><Edit className="w-4 h-4 text-blue-500" /> {t('settingsPage.calendar.editException')}</>
              ) : (
                <><Plus className="w-4 h-4 text-emerald-500" /> {t('settingsPage.calendar.addException')}</>
              )}
            </h3>

            {editingId && (
              <div className="flex items-center gap-2 mb-4 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-[10px] font-bold text-amber-700">{t('settingsPage.calendar.editModeAlert')}</span>
              </div>
            )}
            <form onSubmit={handleUpsert} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t('settingsPage.calendar.exceptionType')}</label>
                <select 
                  value={form.type} 
                  onChange={e => setForm({...form, type: e.target.value, swapDate: ''})} 
                  disabled={(!editingId && !permissions.canCreate) || (editingId && !permissions.canUpdate)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 disabled:opacity-60"
                >
                  <option value="HOLIDAY">{t('settingsPage.calendar.holidayOption')}</option>
                  <option value="WORKDAY">{t('settingsPage.calendar.workdayOption')}</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  {form.type === 'WORKDAY' ? t('settingsPage.calendar.workdayDateLabel') : t('settingsPage.calendar.dateLabel')}
                </label>
                <input 
                  type="date" 
                  value={form.date} 
                  onChange={e => setForm({...form, date: e.target.value})} 
                  disabled={(!editingId && !permissions.canCreate) || (editingId && !permissions.canUpdate)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60" 
                  required 
                />
              </div>

              {form.type === 'WORKDAY' && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-2 mt-2">
                  <label className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">{t('settingsPage.calendar.swapDateLabel')} <span className="text-red-500">*</span></label>
                  <input 
                    type="date" 
                    value={form.swapDate || ''} 
                    onChange={e => setForm({...form, swapDate: e.target.value})} 
                    disabled={(!editingId && !permissions.canCreate) || (editingId && !permissions.canUpdate)}
                    className="w-full bg-white border border-blue-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60" 
                    required 
                  />
                  <p className="text-[9px] text-blue-500 font-medium leading-normal">
                    {t('settingsPage.calendar.swapDateHelp')}
                  </p>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">{t('settingsPage.calendar.descriptionLabel')}</label>
                <input 
                  type="text" 
                  placeholder={t('settingsPage.calendar.descriptionPlaceholder')} 
                  value={form.description} 
                  onChange={e => setForm({...form, description: e.target.value})} 
                  disabled={(!editingId && !permissions.canCreate) || (editingId && !permissions.canUpdate)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60" 
                  required 
                />
              </div>
              <button 
                type="submit"
                disabled={upsertMutation.isPending || (!editingId && !permissions.canCreate) || (editingId && !permissions.canUpdate)} 
                className={`w-full ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} disabled:opacity-50 text-white rounded-xl py-2.5 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer`}
              >
                {upsertMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editingId ? t('settingsPage.calendar.btnUpdate') : t('settingsPage.calendar.btnSave')}
              </button>
              {editingId && (
                <div className="flex gap-2 mt-2">
                  <button 
                    type="button"
                    onClick={handleDeleteFromForm}
                    disabled={deleteMutation.isPending || !permissions.canDelete}
                    className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl py-2 text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {deleteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} {t('settingsPage.calendar.btnDelete')}
                  </button>
                  <button 
                    type="button"
                    onClick={handleCancelEdit}
                    className="flex-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl py-2 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer"
                  >
                    {t('settingsPage.calendar.btnCancel')}
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Saran Hari Libur Nasional */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" /> {t('settingsPage.calendar.suggestionsTitle')}
              </h3>
              <span className="text-[9px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded-full border border-amber-200/30 uppercase tracking-wide">
                {t('settingsPage.calendar.nationalTag')}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
              {t('settingsPage.calendar.suggestionsDesc')}
            </p>

            <div className="space-y-2.5 max-h-[280px] overflow-y-auto pr-1">
              {getNationalHolidaysForMonth(selectedYear, selectedMonth).length === 0 ? (
                <div className="text-center py-6 text-[10px] text-slate-400 font-semibold uppercase tracking-wider border border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                  {t('settingsPage.calendar.noNationalHolidays')}
                </div>
              ) : (
                getNationalHolidaysForMonth(selectedYear, selectedMonth).map((s) => {
                  const isAlreadyAdded = holidays.some(
                    (h) => h.date.split('T')[0] === s.date && h.type === 'HOLIDAY'
                  );

                  return (
                    <div
                      key={s.date}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                        isAlreadyAdded
                          ? 'bg-slate-50 border-slate-150'
                          : 'bg-amber-50/20 border-amber-100 hover:border-amber-200'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${
                            isAlreadyAdded
                              ? 'bg-slate-200 text-slate-500'
                              : 'bg-amber-100 text-amber-800 font-bold border border-amber-200/30'
                          }`}>
                            {s.date.split('-')[2]}
                          </span>
                          <span className="text-[10px] font-bold text-slate-700 truncate block">
                            {s.description}
                          </span>
                        </div>
                        <span className="text-[9px] text-slate-400 font-medium block mt-1.5">
                          {new Date(s.date).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                        </span>
                      </div>

                      {isAlreadyAdded ? (
                        <div className="flex items-center gap-1 text-[9px] font-extrabold text-emerald-600 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {t('settingsPage.calendar.appliedStatus')}
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={upsertMutation.isPending || !permissions.canCreate}
                          onClick={() => upsertMutation.mutate({ date: s.date, type: 'HOLIDAY', description: s.description })}
                          className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-[9px] px-2.5 py-1.5 rounded-lg transition-all cursor-pointer shadow-xs whitespace-nowrap"
                        >
                          {t('settingsPage.calendar.btnApply')}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right View Panel */}
        <div className="md:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-[400px]">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5 border-b border-slate-100 pb-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-blue-500" /> {t('settingsPage.calendar.calendarTitle')}
            </h3>
            <div className="flex flex-wrap gap-2 items-center w-full sm:w-auto">
              {/* Tab Selector */}
              <div className="flex border border-slate-200 bg-slate-50 p-0.5 rounded-lg mr-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveView('grid')}
                  className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all ${
                    activeView === 'grid' 
                      ? 'bg-white text-blue-600 shadow-xs border border-slate-200/50' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t('settingsPage.calendar.btnGrid')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('list')}
                  className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all ${
                    activeView === 'list' 
                      ? 'bg-white text-blue-600 shadow-xs border border-slate-200/50' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t('settingsPage.calendar.btnList')}
                </button>
              </div>

              {/* Month Selector */}
              <select 
                value={selectedMonth} 
                onChange={e => setSelectedMonth(Number(e.target.value))} 
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-700 focus:outline-none"
              >
                {Array.from({length: 12}, (_, i) => (
                  <option key={i+1} value={i+1}>
                    {new Date(2000, i).toLocaleString(i18n.language, {month:'long'})}
                  </option>
                ))}
              </select>

              {/* Year Selector */}
              <select 
                value={selectedYear} 
                onChange={e => setSelectedYear(Number(e.target.value))} 
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-700 focus:outline-none"
              >
                {[currentYear-1, currentYear, currentYear+1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
            ) : activeView === 'grid' ? (
              /* Calendar Grid View */
              <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-150 animate-in fade-in duration-300">
                <div className="grid grid-cols-7 gap-1.5 text-center mb-2.5">
                  {weekdayNames.map((w, idx) => (
                    <div key={w} className={`text-[10px] font-bold uppercase py-1 ${idx === 0 ? 'text-red-500' : 'text-slate-400'}`}>
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {daysInMonth.map((day, idx) => {
                    if (!day) return <div key={`empty-${idx}`} className="aspect-square bg-slate-100/30 rounded-xl border border-transparent" />;
                    
                    const year = day.getFullYear();
                    const month = String(day.getMonth() + 1).padStart(2, '0');
                    const dateNum = String(day.getDate()).padStart(2, '0');
                    const dateStr = `${year}-${month}-${dateNum}`;
                    const isToday = dateStr === todayStr;
                    const exception = holidays.find(h => h.date.split('T')[0] === dateStr);
                    const natHoliday = getNationalHoliday(dateStr);
                    const isWeekend = !workingDays.includes(day.getDay());
                    
                    let bgClass = "bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:bg-blue-50/40";
                    let label = "";
                    let labelClass = "";

                    if (exception) {
                      if (exception.type === 'HOLIDAY') {
                        bgClass = "bg-rose-50/90 border-rose-200 text-rose-700 hover:bg-rose-100/90 hover:border-rose-300 font-bold shadow-xs";
                        label = t('settingsPage.calendar.cellLabelHoliday');
                        labelClass = "bg-rose-100/70 text-rose-700";
                      } else if (exception.type === 'WORKDAY') {
                        bgClass = "bg-emerald-50/90 border-emerald-200 text-emerald-700 hover:bg-emerald-100/90 hover:border-emerald-300 font-bold shadow-xs";
                        label = t('settingsPage.calendar.cellLabelWorkday');
                        labelClass = "bg-emerald-100/70 text-emerald-700";
                      }
                    } else if (natHoliday) {
                      bgClass = "bg-amber-50/30 border-amber-300 border-dashed text-amber-700 hover:bg-amber-100/40 hover:border-amber-400 font-semibold shadow-xs";
                      label = t('settingsPage.calendar.cellLabelSuggestion');
                      labelClass = "bg-amber-100/80 text-amber-800";
                    } else if (isWeekend) {
                      bgClass = "bg-slate-100/50 border-slate-150 text-slate-400 hover:border-blue-300 hover:bg-blue-50/30";
                    }

                    if (isToday) {
                      bgClass += " ring-2 ring-blue-500 ring-offset-1 z-10 border-blue-500 shadow-sm shadow-blue-500/10";
                    }

                    let titleText = exception 
                      ? `${exception.description} (${exception.type === 'HOLIDAY' ? t('settingsPage.calendar.tooltipLabelHoliday') : t('settingsPage.calendar.tooltipLabelWorkday')})` 
                      : (natHoliday ? `${t('settingsPage.calendar.tooltipLabelHoliday')}: ${natHoliday}` : (isWeekend ? t('settingsPage.calendar.tooltipLabelWeekend') : t('settingsPage.calendar.tooltipLabelNormal')));

                    if (isToday) {
                      titleText += ` (${t('settingsPage.calendar.cellLabelToday')})`;
                    }

                    return (
                      <button
                        key={dateStr}
                        type="button"
                        onClick={() => {
                          if (exception) {
                            if (permissions.canUpdate) handleEdit(exception);
                          } else {
                            if (permissions.canCreate) {
                              setEditingId(null);
                              setForm({
                                date: dateStr,
                                swapDate: '',
                                type: 'HOLIDAY',
                                description: natHoliday || ''
                              });
                            }
                          }
                        }}
                        title={titleText}
                        className={`aspect-square flex flex-col items-center justify-between p-2 border rounded-2xl transition-all text-xs font-semibold relative focus:outline-none ${bgClass} ${
                          (!exception && !permissions.canCreate) || (exception && !permissions.canUpdate)
                            ? 'cursor-default'
                            : 'cursor-pointer'
                        }`}
                      >
                        <span className={`self-start text-[10px] leading-none px-1.5 py-0.5 rounded-md ${isWeekend && !exception ? 'text-red-500' : ''} ${isToday ? 'bg-blue-600 text-white font-bold' : ''}`}>{day.getDate()}</span>
                        {label ? (
                          <span className={`text-[7px] font-black tracking-wider px-1 py-0.5 rounded-sm ${labelClass} w-full text-center leading-none mt-1`}>
                            {label}
                          </span>
                        ) : isToday ? (
                          <span className="text-[7px] font-black tracking-wider px-1 py-0.5 rounded-sm bg-blue-100 text-blue-700 w-full text-center leading-none mt-1">
                            {t('settingsPage.calendar.cellLabelToday')}
                          </span>
                        ) : (
                          <span className="h-2" />
                        )}
                        {exception ? (
                          <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-current" />
                        ) : natHoliday ? (
                          <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : holidays.length === 0 ? (
              /* List View Empty */
              <div className="text-center py-16 text-xs text-slate-400 font-bold uppercase tracking-wider border-2 border-dashed border-slate-100 rounded-2xl bg-slate-5/50">
                {t('settingsPage.calendar.noExceptionsMonth')}
              </div>
            ) : (
              /* List View Grid */
              <div className="space-y-2 max-h-[380px] pr-1 overflow-y-auto animate-in fade-in duration-300">
                {holidays.map(h => (
                  <div key={h.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex justify-between items-center shadow-xs hover:border-slate-300 hover:shadow-sm transition-all duration-200">
                    <div className="flex items-center gap-4">
                      <div className={`px-2.5 py-1 rounded-md text-[9px] font-extrabold tracking-wider uppercase border ${
                        h.type === 'HOLIDAY' 
                          ? 'bg-rose-50 text-rose-600 border-rose-100' 
                          : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      }`}>
                        {h.type === 'HOLIDAY' ? t('settingsPage.calendar.cellLabelHoliday') : t('settingsPage.calendar.cellLabelWorkday')}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{parseLocalDateString(h.date)}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide mt-0.5">{h.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {permissions.canUpdate && (
                        <button 
                          type="button"
                          onClick={() => handleEdit(h)} 
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all border border-slate-100 hover:border-blue-100 cursor-pointer"
                          title={t('settingsPage.calendar.editException')}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      )}
                      {permissions.canDelete && (
                        <button 
                          type="button"
                          onClick={() => { if(confirm(t('settingsPage.calendar.alertDeleteConfirm'))) deleteMutation.mutate(h.id) }} 
                          disabled={deleteMutation.isPending} 
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-slate-100 hover:border-rose-100 disabled:opacity-50 cursor-pointer"
                          title={t('settingsPage.calendar.btnDelete')}
                        >
                          {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyCalendarSettings;
