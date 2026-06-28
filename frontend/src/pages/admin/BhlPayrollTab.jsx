import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { bhlPayrollAPI } from '../../services/api';
import { Loader2, Save, Lock, Trash2, Eye, Printer, RefreshCw, ArrowLeft, X } from 'lucide-react';

const rp = (n) => 'Rp ' + (Math.round(n || 0)).toLocaleString('id-ID');

const BhlPayrollTab = () => {
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [openId, setOpenId] = useState(null);
  const [slip, setSlip] = useState(null);

  const { data: listData, isLoading } = useQuery({ queryKey: ['bhl-payroll-list'], queryFn: () => bhlPayrollAPI.list() });
  const list = listData?.data || [];

  const { data: detailData, isLoading: detLoading } = useQuery({ queryKey: ['bhl-payroll', openId], queryFn: () => bhlPayrollAPI.getById(openId), enabled: !!openId });
  const detail = detailData?.data;

  const genM = useMutation({ mutationFn: () => bhlPayrollAPI.generate({ month }), onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['bhl-payroll-list'] }); alert(r.message); }, onError: (e) => alert(e.message) });
  const finM = useMutation({ mutationFn: (id) => bhlPayrollAPI.finalize(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bhl-payroll-list'] }); qc.invalidateQueries({ queryKey: ['bhl-payroll', openId] }); }, onError: (e) => alert(e.message) });
  const delM = useMutation({ mutationFn: (id) => bhlPayrollAPI.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['bhl-payroll-list'] }); setOpenId(null); }, onError: (e) => alert(e.message) });

  const showSlip = async (empId) => {
    try { const res = await bhlPayrollAPI.getSlip(detail.id, empId); if (res.success) setSlip(res.data); }
    catch (e) { alert(e.message); }
  };

  // ── Detail view ──
  if (openId) {
    const isFinal = detail?.status === 'FINALIZED';
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <button onClick={() => setOpenId(null)} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </button>
          <div className="flex items-center gap-2">
            {detail && !isFinal && (
              <>
                <button onClick={() => { if (window.confirm('Kunci penggajian ini? Setelah final tidak bisa diubah.')) finM.mutate(detail.id); }} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Kunci (Final)
                </button>
                <button onClick={() => { if (window.confirm('Hapus draf ini?')) delM.mutate(detail.id); }} className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Hapus
                </button>
              </>
            )}
          </div>
        </div>

        {detLoading || !detail ? (
          <div className="flex justify-center py-12"><Loader2 className="w-7 h-7 animate-spin text-emerald-600" /></div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-lg font-bold text-slate-800">Penggajian BHL — {detail.periodName}</h3>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${isFinal ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                {isFinal ? 'Final (terkunci)' : 'Draf'}
              </span>
            </div>
            <div className="text-xs text-slate-500 mb-4">
              {detail.totalEmployees} pekerja · total upah <span className="font-bold text-slate-700">{rp(detail.totalWage)}</span>
              {isFinal && detail.finalizedBy && <> · dikunci oleh {detail.finalizedBy}</>}
            </div>
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left">Pekerja</th>
                    <th className="px-4 py-3 text-center">Hadir</th>
                    <th className="px-4 py-3 text-center">½ Hari</th>
                    <th className="px-4 py-3 text-center">Efektif</th>
                    <th className="px-4 py-3 text-right">Tarif/hari</th>
                    <th className="px-4 py-3 text-right">Total Upah</th>
                    <th className="px-4 py-3 text-center">Slip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detail.details.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-slate-800 text-xs">{d.employeeName}</div>
                        <div className="text-[10px] text-slate-400">{d.employeeCode} · {d.department}</div>
                      </td>
                      <td className="px-4 py-2.5 text-center">{d.workingDays}</td>
                      <td className="px-4 py-2.5 text-center">{d.halfDays}</td>
                      <td className="px-4 py-2.5 text-center font-semibold">{d.effectiveDays}</td>
                      <td className="px-4 py-2.5 text-right">{rp(d.dailyRate)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{rp(d.totalWage)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => showSlip(d.employeeId)} className="p-1.5 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600" title="Lihat slip">
                          <Printer className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {slip && <SlipModal slip={slip} onClose={() => setSlip(null)} />}
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-base font-bold text-slate-800 mb-1">Buat / Perbarui Penggajian BHL</h3>
        <p className="text-xs text-slate-500 mb-4">Ambil snapshot upah dari absensi bulan terpilih. Draf bisa diperbarui; setelah dikunci (Final) tidak berubah lagi walau absensi lama diedit.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Bulan</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm" />
          </div>
          <button onClick={() => genM.mutate()} disabled={genM.isPending} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 disabled:opacity-50">
            {genM.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Buat / Perbarui Draf
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h3 className="text-base font-bold text-slate-800 mb-4">Riwayat Penggajian BHL</h3>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-7 h-7 animate-spin text-emerald-600" /></div>
        ) : list.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">Belum ada penggajian BHL. Buat draf di atas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 text-left">Periode</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Pekerja</th>
                  <th className="px-4 py-3 text-right">Total Upah</th>
                  <th className="px-4 py-3 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-bold text-slate-800">{p.periodName}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${p.status === 'FINALIZED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                        {p.status === 'FINALIZED' ? 'Final' : 'Draf'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">{p.totalEmployees}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">{rp(p.totalWage)}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setOpenId(p.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">
                        <Eye className="w-3.5 h-3.5" /> Lihat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const SlipModal = ({ slip, onClose }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm print:hidden" onClick={onClose} />
    <div className="bg-white rounded-2xl w-full max-w-md relative z-10 shadow-2xl">
      <div className="flex items-center justify-between p-4 border-b border-slate-100 print:hidden">
        <h3 className="text-sm font-bold text-slate-800">Slip Upah BHL</h3>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"><Printer className="w-4 h-4" /></button>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>
      </div>
      <div id="bhl-slip" className="p-6 text-sm">
        <div className="text-center mb-4">
          <p className="font-bold text-slate-800">SLIP UPAH HARIAN (BHL)</p>
          <p className="text-xs text-slate-500">Periode {slip.bhlPayroll?.periodName}</p>
        </div>
        <table className="w-full text-xs">
          <tbody>
            <tr><td className="py-1 text-slate-500">Nama</td><td className="py-1 text-right font-bold">{slip.employeeName}</td></tr>
            <tr><td className="py-1 text-slate-500">NIK / Departemen</td><td className="py-1 text-right">{slip.employeeCode} · {slip.department}</td></tr>
            <tr><td className="py-1 text-slate-500">Hari hadir</td><td className="py-1 text-right">{slip.workingDays}</td></tr>
            <tr><td className="py-1 text-slate-500">Setengah hari</td><td className="py-1 text-right">{slip.halfDays}</td></tr>
            <tr><td className="py-1 text-slate-500">Hari efektif</td><td className="py-1 text-right font-semibold">{slip.effectiveDays}</td></tr>
            <tr><td className="py-1 text-slate-500">Tarif / hari</td><td className="py-1 text-right">{rp(slip.dailyRate)}</td></tr>
            <tr className="border-t border-slate-200"><td className="pt-2 font-bold text-slate-800">TOTAL UPAH</td><td className="pt-2 text-right font-extrabold text-emerald-700 text-base">{rp(slip.totalWage)}</td></tr>
          </tbody>
        </table>
        <p className="text-[10px] text-slate-400 mt-4 text-center">BHL tidak termasuk lembur, potongan keterlambatan, BPJS, maupun PPh.</p>
      </div>
    </div>
  </div>
);

export default BhlPayrollTab;
