import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  AlertCircle, 
  HelpCircle, 
  Calculator, 
  Clock, 
  Scale, 
  CheckCircle,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';

const PenaltySettings = ({ formData, handleInputChange, permissions }) => {
  const { t } = useTranslation();
  const canUpdate = permissions?.canUpdate || false;

  // Local state for Simulator
  const [simIn, setSimIn] = useState('08:45');
  const [simOut, setSimOut] = useState('');
  const [simShiftStart, setSimShiftStart] = useState('08:00');
  const [simShiftEnd, setSimShiftEnd] = useState('17:00');
  const [simGrace, setSimGrace] = useState(15);

  // Settings values with defaults
  const rule1Enabled = formData.penaltyRule1Enabled !== 'false';
  const rule1Status = formData.penaltyRule1Status || 'MANGKIR';
  const rule1Minutes = parseInt(formData.penaltyRule1Minutes || '30', 10);

  const rule2Enabled = formData.penaltyRule2Enabled !== 'false';
  const rule2AddPenalty = formData.penaltyRule2AddPenalty === 'true';
  const rule2ExtraMinutes = parseInt(formData.penaltyRule2ExtraMinutes || '0', 10);

  const rule3Enabled = formData.penaltyRule3Enabled !== 'false';
  const rule3Status = formData.penaltyRule3Status || 'MANGKIR';
  const rule3Minutes = parseInt(formData.penaltyRule3Minutes || '30', 10);

  const lateRoundingEnabled = formData.lateRoundingEnabled !== 'false';
  const lateRoundingInterval = parseInt(formData.lateRoundingInterval || '30', 10);

  // Simulator logic (Javascript clone of backend lateCalculator)
  const runSimulation = () => {
    // 1. Calculate Lateness
    let lateMinutes = 0;
    let baseStatus = 'PRESENT';

    if (simIn) {
      const [sh, sm] = simShiftStart.split(':').map(Number);
      const [ih, im] = simIn.split(':').map(Number);
      const shiftMins = sh * 60 + sm;
      const inMins = ih * 60 + im;
      const graceDeadline = shiftMins + Number(simGrace);

      if (inMins > graceDeadline) {
        baseStatus = 'LATE';
        const rawDiff = inMins - shiftMins;
        if (lateRoundingEnabled) {
          lateMinutes = Math.ceil(rawDiff / lateRoundingInterval) * lateRoundingInterval;
        } else {
          lateMinutes = rawDiff;
        }
      }
    }

    // 2. Resolve Status
    let finalStatus = 'ABSENT';
    let penaltyMinutes = 0;
    let notes = '';

    const checkInTime = simIn ? new Date(`2026-06-02T${simIn}:00`) : null;
    const checkOutTime = simOut ? new Date(`2026-06-02T${simOut}:00`) : null;

    // Check early departure
    let isEarly = false;
    if (simOut && simShiftEnd) {
      const [eh, em] = simShiftEnd.split(':').map(Number);
      const [oh, om] = simOut.split(':').map(Number);
      const shiftEndMins = eh * 60 + em;
      const outMins = oh * 60 + om;
      isEarly = outMins < shiftEndMins;
    }

    if (!simIn && !simOut) {
      finalStatus = 'ABSENT';
      notes = t('settingsPage.penaltySettings.simNotesNoData');
    } else if (!simIn) {
      // Rule 1
      if (rule1Enabled) {
        finalStatus = rule1Status;
        penaltyMinutes = rule1Minutes;
        notes = t('settingsPage.penaltySettings.simNotesRule1Active', {
          status: rule1Status === 'MANGKIR' ? t('settingsPage.penaltySettings.rule1OptionMangkir') : t('settingsPage.penaltySettings.rule1OptionAbsent'),
          minutes: rule1Minutes
        });
      } else {
        finalStatus = 'ABSENT';
        notes = t('settingsPage.penaltySettings.simNotesRule1Inactive');
      }
    } else if (simIn && baseStatus === 'LATE') {
      // Rule 2
      finalStatus = isEarly ? 'EARLY_DEPARTURE' : 'LATE';
      let extra = rule2AddPenalty ? rule2ExtraMinutes : 0;
      penaltyMinutes = lateMinutes + extra;
      
      const earlySuffix = isEarly ? t('settingsPage.penaltySettings.simNotesRule2EarlySuffix') : '';
      const extraPenalty = rule2AddPenalty 
        ? t('settingsPage.penaltySettings.simNotesRule2ExtraPenalty', { minutes: rule2ExtraMinutes }) 
        : t('settingsPage.penaltySettings.simNotesRule2NoExtraPenalty');

      notes = t('settingsPage.penaltySettings.simNotesRule2Active', {
        lateMinutes,
        earlySuffix,
        extraPenalty
      });
    } else if (simIn && !simOut && baseStatus === 'PRESENT') {
      // Rule 3 (Masuk tepat waktu but no checkout)
      if (rule3Enabled) {
        finalStatus = rule3Status;
        penaltyMinutes = rule3Minutes;
        notes = t('settingsPage.penaltySettings.simNotesRule3Active', {
          status: rule3Status === 'MANGKIR' ? t('settingsPage.penaltySettings.rule1OptionMangkir') : t('settingsPage.penaltySettings.rule1OptionAbsent'),
          minutes: rule3Minutes
        });
      } else {
        finalStatus = 'PRESENT';
        notes = t('settingsPage.penaltySettings.simNotesRule3Inactive');
      }
    } else {
      finalStatus = isEarly ? 'EARLY_DEPARTURE' : 'PRESENT';
      notes = isEarly 
        ? t('settingsPage.penaltySettings.simNotesEarlyDeparture') 
        : t('settingsPage.penaltySettings.simNotesNormal');
    }

    return { finalStatus, lateMinutes, penaltyMinutes, notes };
  };

  const simResult = runSimulation();

  return (
    <div className="space-y-10">
      {/* Tab Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-sm">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800 tracking-tight">{t('settingsPage.penaltySettings.title')}</h3>
            <p className="text-xs text-slate-500 font-medium mt-1">{t('settingsPage.penaltySettings.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Grid Settings */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-6">
          
          {/* Lateness Rounding Card */}
          <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200/60 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-blue-600" />
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{t('settingsPage.penaltySettings.roundingTitle')}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{t('settingsPage.penaltySettings.roundingDesc')}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={!canUpdate}
                onClick={() => handleInputChange('lateRoundingEnabled', String(!lateRoundingEnabled))}
                className="text-blue-600 hover:text-blue-700 transition"
              >
                {lateRoundingEnabled ? (
                  <ToggleRight className="w-12 h-12" />
                ) : (
                  <ToggleLeft className="w-12 h-12 text-slate-400" />
                )}
              </button>
            </div>

            {lateRoundingEnabled && (
              <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{t('settingsPage.penaltySettings.roundingInterval')}</label>
                  <input
                    type="number"
                    disabled={!canUpdate}
                    value={lateRoundingInterval}
                    onChange={(e) => handleInputChange('lateRoundingInterval', e.target.value)}
                    className="w-full bg-white border border-slate-250 px-4 py-3 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                    placeholder="30"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Rule 1 Card */}
          <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200/60 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600" />
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{t('settingsPage.penaltySettings.rule1Title')}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{t('settingsPage.penaltySettings.rule1Desc')}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={!canUpdate}
                onClick={() => handleInputChange('penaltyRule1Enabled', String(!rule1Enabled))}
                className="text-rose-600 hover:text-rose-700 transition"
              >
                {rule1Enabled ? (
                  <ToggleRight className="w-12 h-12 text-rose-600" />
                ) : (
                  <ToggleLeft className="w-12 h-12 text-slate-400" />
                )}
              </button>
            </div>

            {rule1Enabled && (
              <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{t('settingsPage.penaltySettings.rule1Status')}</label>
                  <select
                    disabled={!canUpdate}
                    value={rule1Status}
                    onChange={(e) => handleInputChange('penaltyRule1Status', e.target.value)}
                    className="w-full bg-white border border-slate-250 px-4 py-3 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                  >
                    <option value="MANGKIR">{t('settingsPage.penaltySettings.rule1OptionMangkir')}</option>
                    <option value="ABSENT">{t('settingsPage.penaltySettings.rule1OptionAbsent')}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{t('settingsPage.penaltySettings.rule1Minutes')}</label>
                  <input
                    type="number"
                    disabled={!canUpdate}
                    value={rule1Minutes}
                    onChange={(e) => handleInputChange('penaltyRule1Minutes', e.target.value)}
                    className="w-full bg-white border border-slate-250 px-4 py-3 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                    placeholder="30"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Rule 2 Card */}
          <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200/60 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{t('settingsPage.penaltySettings.rule2Title')}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{t('settingsPage.penaltySettings.rule2Desc')}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
              <HelpCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
                {t('settingsPage.penaltySettings.rule2Info')}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <label className="text-xs font-bold text-slate-700">{t('settingsPage.penaltySettings.rule2AddPenalty')}</label>
                <p className="text-[10px] text-slate-500 font-medium">{t('settingsPage.penaltySettings.rule2AddPenaltyDesc')}</p>
              </div>
              <button
                type="button"
                disabled={!canUpdate}
                onClick={() => handleInputChange('penaltyRule2AddPenalty', String(!rule2AddPenalty))}
                className="text-blue-600 hover:text-blue-700 transition"
              >
                {rule2AddPenalty ? (
                  <ToggleRight className="w-10 h-10" />
                ) : (
                  <ToggleLeft className="w-10 h-10 text-slate-400" />
                )}
              </button>
            </div>

            {rule2AddPenalty && (
              <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-300">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{t('settingsPage.penaltySettings.rule2ExtraMinutes')}</label>
                  <input
                    type="number"
                    disabled={!canUpdate}
                    value={rule2ExtraMinutes}
                    onChange={(e) => handleInputChange('penaltyRule2ExtraMinutes', e.target.value)}
                    className="w-full bg-white border border-slate-250 px-4 py-3 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Rule 3 Card */}
          <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-200/60 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                <div>
                  <h4 className="text-sm font-bold text-slate-800">{t('settingsPage.penaltySettings.rule3Title')}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{t('settingsPage.penaltySettings.rule3Desc')}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={!canUpdate}
                onClick={() => handleInputChange('penaltyRule3Enabled', String(!rule3Enabled))}
                className="text-orange-600 hover:text-orange-700 transition"
              >
                {rule3Enabled ? (
                  <ToggleRight className="w-12 h-12 text-orange-600" />
                ) : (
                  <ToggleLeft className="w-12 h-12 text-slate-400" />
                )}
              </button>
            </div>

            {rule3Enabled && (
              <div className="pt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{t('settingsPage.penaltySettings.rule1Status')}</label>
                  <select
                    disabled={!canUpdate}
                    value={rule3Status}
                    onChange={(e) => handleInputChange('penaltyRule3Status', e.target.value)}
                    className="w-full bg-white border border-slate-250 px-4 py-3 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                  >
                    <option value="MANGKIR">{t('settingsPage.penaltySettings.rule1OptionMangkir')}</option>
                    <option value="ABSENT">{t('settingsPage.penaltySettings.rule1OptionAbsent')}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{t('settingsPage.penaltySettings.rule1Minutes')}</label>
                  <input
                    type="number"
                    disabled={!canUpdate}
                    value={rule3Minutes}
                    onChange={(e) => handleInputChange('penaltyRule3Minutes', e.target.value)}
                    className="w-full bg-white border border-slate-250 px-4 py-3 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                    placeholder="30"
                  />
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Simulator Column */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-blue-50 via-white to-blue-50/30 text-slate-800 p-6 md:p-8 rounded-3xl border border-blue-100 shadow-lg space-y-6">
            <div className="flex items-center gap-3">
              <Calculator className="w-6 h-6 text-blue-600 animate-pulse" />
              <div>
                <h4 className="text-md font-extrabold tracking-tight text-slate-850">{t('settingsPage.penaltySettings.simTitle')}</h4>
                <p className="text-[10px] text-blue-600 font-extrabold uppercase tracking-wider mt-0.5">{t('settingsPage.penaltySettings.simSub')}</p>
              </div>
            </div>

            <div className="space-y-4 pt-2 border-t border-blue-100">
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.penaltySettings.simShiftStart')}</label>
                  <input
                    type="time"
                    value={simShiftStart}
                    onChange={(e) => setSimShiftStart(e.target.value)}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.penaltySettings.simShiftEnd')}</label>
                  <input
                    type="time"
                    value={simShiftEnd}
                    onChange={(e) => setSimShiftEnd(e.target.value)}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.penaltySettings.simGrace')}</label>
                <input
                  type="number"
                  value={simGrace}
                  onChange={(e) => setSimGrace(e.target.value)}
                  className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all shadow-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.penaltySettings.simIn')}</label>
                  <input
                    type="time"
                    value={simIn}
                    onChange={(e) => setSimIn(e.target.value)}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all shadow-sm"
                  />
                  {simIn && (
                    <button onClick={() => setSimIn('')} className="text-[10px] text-rose-500 font-bold hover:underline transition-all block mt-1">{t('settingsPage.penaltySettings.simClear')}</button>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.penaltySettings.simOut')}</label>
                  <input
                    type="time"
                    value={simOut}
                    onChange={(e) => setSimOut(e.target.value)}
                    className="w-full bg-white border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all shadow-sm"
                  />
                  {simOut && (
                    <button onClick={() => setSimOut('')} className="text-[10px] text-rose-500 font-bold hover:underline transition-all block mt-1">{t('settingsPage.penaltySettings.simClear')}</button>
                  )}
                </div>
              </div>

            </div>

            {/* Results Block */}
            <div className="bg-blue-50/60 border border-blue-100 p-5 rounded-2xl space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-550">{t('settingsPage.penaltySettings.simResultStatus')}</span>
                <span className={`px-3 py-1 rounded-xl text-[10px] font-extrabold uppercase tracking-wider shadow-sm transition-all duration-300 ${
                  simResult.finalStatus === 'PRESENT' ? 'bg-emerald-500 text-white' :
                  simResult.finalStatus === 'LATE' ? 'bg-amber-500 text-white' :
                  simResult.finalStatus === 'EARLY_DEPARTURE' ? 'bg-blue-500 text-white animate-blink' :
                  'bg-rose-500 text-white'
                }`}>
                  {simResult.finalStatus === 'PRESENT' ? t('attendancePage.kpiPresent') :
                   simResult.finalStatus === 'LATE' ? t('attendancePage.kpiLate') :
                   simResult.finalStatus === 'EARLY_DEPARTURE' ? t('attendancePage.kpiEarlyDeparture') :
                   simResult.finalStatus === 'MANGKIR' ? t('attendancePage.kpiMangkir') : t('attendancePage.kpiAbsent')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-blue-100 pt-4">
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.penaltySettings.simResultLate')}</p>
                  <p className="text-xl font-black text-slate-800 mt-1">{simResult.lateMinutes} <span className="text-xs font-bold text-slate-450">{t('settingsPage.penaltySettings.simResultUnit')}</span></p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{t('settingsPage.penaltySettings.simResultPenalty')}</p>
                  <p className="text-xl font-black text-rose-500 mt-1">{simResult.penaltyMinutes} <span className="text-xs font-bold text-slate-450">{t('settingsPage.penaltySettings.simResultUnit')}</span></p>
                </div>
              </div>

              <div className="border-t border-blue-100 pt-4 text-[10px] text-slate-600 leading-relaxed font-semibold italic">
                {simResult.notes}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default PenaltySettings;
