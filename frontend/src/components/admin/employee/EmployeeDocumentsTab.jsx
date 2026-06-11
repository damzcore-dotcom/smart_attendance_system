import { useState, useEffect } from 'react';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { employeeAPI, getFileUrl } from '../../../services/api';

const EmployeeDocumentsTab = ({ employeeId }) => {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [physicalLocator, setPhysicalLocator] = useState('');
  const [file, setFile] = useState(null);

  const fetchDocs = async () => {
    if (!employeeId) return;
    setIsLoading(true);
    try {
      const res = await employeeAPI.getDocuments(employeeId);
      if (res.success) {
        setDocuments(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [employeeId]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !name) return alert('File dan nama dokumen wajib diisi!');
    setUploading(true);
    try {
      const res = await employeeAPI.uploadDocument(employeeId, file, name, expiryDate, physicalLocator);
      if (res.success) {
        alert('Dokumen berhasil diunggah!');
        setName('');
        setExpiryDate('');
        setPhysicalLocator('');
        setFile(null);
        const fileInput = document.getElementById('doc-file-input');
        if (fileInput) fileInput.value = '';
        fetchDocs();
      }
    } catch (err) {
      alert(`Gagal mengunggah: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Apakah Anda yakin ingin menghapus dokumen ini?')) return;
    try {
      const res = await employeeAPI.deleteDocument(docId);
      if (res.success) {
        alert('Dokumen berhasil dihapus.');
        fetchDocs();
      }
    } catch (err) {
      alert(`Gagal menghapus: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
          <Upload className="w-4 h-4 text-blue-600" /> Unggah Dokumen Baru
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block ml-1">Nama Dokumen</label>
            <input 
              type="text" 
              placeholder="Contoh: KTP, KK, Kontrak PKWT" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block ml-1">Lokasi Rak/Arsip Fisik (Opsional)</label>
            <input 
              type="text" 
              placeholder="Contoh: Rak A, Baris 2, Map 15" 
              value={physicalLocator} 
              onChange={e => setPhysicalLocator(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block ml-1">Masa Berlaku Akhir (Opsional)</label>
            <input 
              type="date" 
              value={expiryDate} 
              onChange={e => setExpiryDate(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block ml-1">Pilih File (PDF, Gambar, Word)</label>
            <input 
              id="doc-file-input"
              type="file" 
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={e => setFile(e.target.files[0])} 
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button 
            type="button" 
            onClick={handleUpload}
            disabled={uploading || !file || !name}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Unggah Berkas
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h4 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600" /> Arsip Dokumen Karyawan
        </h4>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Belum ada dokumen yang diunggah.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Nama Dokumen</th>
                  <th className="py-3 px-4">Lokasi Fisik Rak</th>
                  <th className="py-3 px-4">Tanggal Unggah</th>
                  <th className="py-3 px-4">Masa Berlaku</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map(doc => (
                  <tr key={doc.id} className="text-sm text-slate-700 hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-bold text-slate-800">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        {doc.name}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {doc.physicalLocator ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-100 rounded-lg text-xs font-semibold shadow-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          {doc.physicalLocator}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs italic">Belum ditentukan</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{new Date(doc.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 px-4">
                      {doc.expiryDate ? (
                        <span className={`px-2 py-1 rounded-md text-xs font-semibold ${
                          new Date(doc.expiryDate) < new Date() 
                            ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        }`}>
                          Habis: {new Date(doc.expiryDate).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">Selamanya</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <a 
                        href={getFileUrl(doc.fileUrl)} 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-bold transition-all"
                      >
                        Buka
                      </a>
                      <button 
                        type="button"
                        onClick={() => handleDelete(doc.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-bold transition-all"
                      >
                        Hapus
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

export default EmployeeDocumentsTab;
