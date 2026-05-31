window.APP_CONFIG = {
  // Client bisa mengganti URL & Port ini secara manual di dalam folder dist/app-config.js
  API_URL: window.location.protocol + "//" + window.location.hostname + ":" + 
    ((window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1' || 
      window.location.hostname === '192.168.13.190') ? '5000' : '5050')
};
