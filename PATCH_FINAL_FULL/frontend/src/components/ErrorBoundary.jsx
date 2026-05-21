import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * Global Error Boundary — catches unhandled React errors
 * and displays a friendly error page instead of a white screen.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
          <div className="w-full max-w-md text-center">
            <div className="w-20 h-20 bg-red-100 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Terjadi Kesalahan</h1>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              Sistem mengalami error yang tidak terduga. Silakan muat ulang halaman atau hubungi administrator.
            </p>
            {process.env.NODE_ENV !== 'production' && this.state.error && (
              <pre className="text-left text-xs bg-red-50 border border-red-200 rounded-xl p-4 mb-6 overflow-auto max-h-40 text-red-600">
                {this.state.error.toString()}
              </pre>
            )}
            <button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-all shadow-lg shadow-blue-600/20"
            >
              <RefreshCw className="w-4 h-4" />
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
