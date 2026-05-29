import { useState, useMemo } from 'react';
import { 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight, 
  ArrowLeft,
  Loader2,
  Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { authAPI, calendarAPI, scheduleAPI } from '../../services/api';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const Calendar = () => {
  const navigate = useNavigate();
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const user = authAPI.getStoredUser();
  const empId = user?.employee?.id;

  const { data: holidays, isLoading: holidaysLoading } = useQuery({
    queryKey: ['calendar-holidays', currentYear],
    queryFn: () => calendarAPI.getAll({ year: currentYear }),
  });

  const { data: overridesData, isLoading: overridesLoading } = useQuery({
    queryKey: ['schedule-overrides', empId],
    queryFn: () => scheduleAPI.getOverrides(),
    enabled: !!empId,
  });

  const { data: defaultShiftData, isLoading: shiftLoading } = useQuery({
    queryKey: ['employee-default-shift', empId],
    queryFn: () => scheduleAPI.getEmployeeShift(empId),
    enabled: !!empId,
  });

  const defaultShift = defaultShiftData?.data || user?.employee?.shift;

  const getShiftForDate = (date) => {
    const list = overridesData?.data || overridesData || [];
    if (Array.isArray(list) && empId) {
      const activeOverride = list.find((o) => {
        if (o.employeeId !== empId) return false;
        const start = new Date(o.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(o.endDate);
        end.setHours(23, 59, 59, 999);
        return date >= start && date <= end;
      });
      if (activeOverride) {
        return { ...activeOverride.shift, isOverride: true, overrideId: activeOverride.id };
      }
    }
    return defaultShift ? { ...defaultShift, isOverride: false } : null;
  };

  const getShiftAbbrev = (shift) => {
    if (!shift || shift.name === 'No Shift Assigned') return 'OFF';
    return shift.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  };

  const holidayMap = useMemo(() => {
    const map = {};
    const list = holidays?.data || holidays || [];
    if (Array.isArray(list)) {
      list.forEach((h) => {
        const d = new Date(h.date);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        map[key] = h;
      });
    }
    return map;
  }, [holidays]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const days = [];

    // Empty cells for days before the 1st
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentYear, currentMonth, d);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const key = `${currentYear}-${currentMonth}-${d}`;
      const holiday = holidayMap[key] || null;
      const isToday = d === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear();
      const activeShift = getShiftForDate(date);

      days.push({ day: d, isWeekend, holiday, isToday, activeShift, date });
    }

    return days;
  }, [currentYear, currentMonth, holidayMap, today, overridesData, defaultShift]);

  const goToPrev = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const goToNext = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  const isLoading = holidaysLoading || overridesLoading || shiftLoading;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate('/employee')}
          className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Kalender Perusahaan</h1>
          <p className="text-xs text-slate-400 mt-0.5">Company holidays & schedule</p>
        </div>
      </div>

      {/* Month Navigation */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={goToPrev}
            className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors border border-slate-200"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={goToToday} className="text-center">
            <h2 className="text-lg font-bold text-slate-800">{MONTH_NAMES[currentMonth]}</h2>
            <p className="text-xs text-slate-400">{currentYear}</p>
          </button>
          <button
            onClick={goToNext}
            className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors border border-slate-200"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <>
            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS.map((day) => (
                <div 
                  key={day} 
                  className={`text-center text-[10px] font-bold uppercase tracking-wider py-2 ${
                    day === 'Sun' || day === 'Sat' ? 'text-rose-400' : 'text-slate-400'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarDays.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="aspect-square" />;
                }

                const { day, isWeekend, holiday, isToday, activeShift } = cell;
                const isHoliday = !!holiday;

                let bgClass = 'bg-white hover:bg-slate-50 border border-slate-100';
                let textClass = 'text-slate-700';
                let dotClass = '';

                if (isHoliday) {
                  bgClass = 'bg-rose-50 hover:bg-rose-100 border border-rose-200';
                  textClass = 'text-rose-600 font-bold';
                  dotClass = 'bg-rose-500';
                } else if (isWeekend) {
                  bgClass = 'bg-slate-50 border border-slate-100';
                  textClass = 'text-slate-400';
                  dotClass = 'bg-slate-300';
                }

                if (isToday) {
                  bgClass = isHoliday ? 'bg-rose-100 ring-2 ring-rose-400' : 'bg-blue-600 hover:bg-blue-700';
                  textClass = isHoliday ? 'text-rose-700 font-bold' : 'text-white font-bold';
                }

                const abbrev = getShiftAbbrev(activeShift);

                return (
                  <div
                    key={day}
                    className={`aspect-square rounded-2xl flex flex-col items-center justify-between p-2 relative transition-all ${bgClass} group cursor-default shadow-sm`}
                    title={`${holiday?.name || ''}${activeShift ? `\nShift: ${activeShift.name} (${activeShift.startTime} - ${activeShift.endTime})` : ''}`}
                  >
                    <span className={`text-[10px] font-bold ${textClass}`}>{day}</span>
                    
                    {activeShift && (
                      <span className={`text-[8px] font-bold tracking-tight uppercase px-1 py-0.5 rounded truncate max-w-full ${
                        isToday 
                          ? 'bg-white/20 text-white' 
                          : activeShift.isOverride
                            ? 'bg-amber-100 text-amber-800 font-black border border-amber-200'
                            : abbrev === 'OFF'
                              ? 'bg-slate-100 text-slate-400'
                              : 'bg-blue-50 text-blue-600'
                      }`}>
                        {abbrev}
                      </span>
                    )}

                    {isHoliday && !isToday && (
                      <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
                    )}

                    {/* Tooltip for holiday name */}
                    {isHoliday && (
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-2 py-1 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
                        {holiday.name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Holiday List for Current Month */}
      {(() => {
        const monthHolidays = Object.values(holidayMap).filter((h) => {
          const d = new Date(h.date);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        if (monthHolidays.length === 0) return null;

        return (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
              Holidays This Month
            </h3>
            {monthHolidays.map((h) => (
              <div key={h.id || h.date} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
                <div className="w-11 h-11 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500 border border-rose-100 shrink-0">
                  <CalendarDays className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{h.name}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {new Date(h.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Legend */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Legend</h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-md bg-white border border-slate-200" />
            <span className="text-xs text-slate-600">Working Day</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-md bg-rose-50 border border-rose-200" />
            <span className="text-xs text-slate-600">Holiday</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-md bg-slate-100 border border-slate-200" />
            <span className="text-xs text-slate-600">Weekend</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-md bg-blue-600 border border-blue-600" />
            <span className="text-xs text-slate-600">Today</span>
          </div>
        </div>
        <div className="pt-2 border-t border-slate-100">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Shift Indicators</h4>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold bg-blue-50 text-blue-600 px-1 py-0.5 rounded border border-blue-100">D / SP</span>
              <span className="text-[10px] text-slate-500">Base Shift (Default / Pagi)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-1 py-0.5 rounded">SP</span>
              <span className="text-[10px] text-slate-500">Overridden Shift (Roster Khusus)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] font-bold bg-slate-100 text-slate-400 px-1 py-0.5 rounded">OFF</span>
              <span className="text-[10px] text-slate-500">Libur Shift</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calendar;
