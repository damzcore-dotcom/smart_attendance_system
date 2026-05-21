import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, MapPinOff } from 'lucide-react';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-100/40 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/3 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-100/30 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/4 pointer-events-none" />

      <div className="w-full max-w-lg text-center relative z-10">
        {/* Icon */}
        <div className="w-24 h-24 bg-blue-100 text-blue-500 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-lg shadow-blue-100/50">
          <MapPinOff className="w-12 h-12" />
        </div>

        {/* 404 Number */}
        <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 mb-4 tracking-tighter">
          404
        </h1>

        <h2 className="text-2xl font-bold text-slate-800 mb-3">
          Halaman Tidak Ditemukan
        </h2>
        <p className="text-slate-500 text-sm mb-10 leading-relaxed max-w-sm mx-auto">
          Halaman yang Anda cari tidak ada atau telah dipindahkan. Silakan kembali ke halaman utama.
        </p>

        {/* Actions */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali
          </button>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-600/20"
          >
            <Home className="w-4 h-4" />
            Halaman Utama
          </button>
        </div>

        {/* Footer */}
        <p className="text-[10px] text-slate-400 mt-12 uppercase tracking-widest font-medium">
          Smart Attendance Pro
        </p>
      </div>
    </div>
  );
};

export default NotFound;
