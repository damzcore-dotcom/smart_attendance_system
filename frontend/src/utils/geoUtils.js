/**
 * Utility to verify if the GPS location is real or likely fake (Mock Location).
 * Web browsers don't have direct access to Android's isFromMockProvider() flag,
 * so we use heuristics:
 * 1. Suspicious accuracy values combined with lack of altitude/speed data.
 * 2. Perfect static coordinates over a short period of time. Real GPS always has minor fluctuations (noise).
 */
export const verifyRealLocation = (onSuccess, onError, opts = {}) => {
  if (!navigator.geolocation) {
    return onError(new Error("Geolocation is not supported by your browser"));
  }

  // Batas akurasi maksimum (meter) sebelum lokasi ditolak. Browser (terutama desktop/WiFi)
  // sering melaporkan akurasi rendah, jadi default dilonggarkan menjadi 1500 m.
  const maxAccuracy = opts.maxAccuracy || 1500;
  const options = { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 };

  navigator.geolocation.getCurrentPosition(
    (pos1) => {
      const { accuracy, altitude, speed, latitude, longitude } = pos1.coords;

      // Basic heuristic: Accuracy is often perfectly round on Fake GPS (e.g., 10, 20, 65)
      // And they usually don't simulate altitude or speed.
      const suspiciousAccuracies = [1, 5, 10, 15, 20, 65, 100];
      const isSuspicious = suspiciousAccuracies.includes(accuracy) && altitude === null && speed === null;

      if (accuracy > maxAccuracy) {
        return onError(new Error(`GPS Accuracy terlalu rendah (${Math.round(accuracy)}m). Silakan pindah ke area terbuka atau gunakan ponsel.`));
      }

      // Advanced heuristic: Check for static coordinates (No noise)
      // We wait 800ms and request location again. 
      // If latitude and longitude are 100% exactly the same down to the 7th decimal, it's highly likely a Fake GPS.
      // Real GPS always drifts slightly.
      setTimeout(() => {
        navigator.geolocation.getCurrentPosition(
          (pos2) => {
            const lat1 = pos1.coords.latitude;
            const lng1 = pos1.coords.longitude;
            const lat2 = pos2.coords.latitude;
            const lng2 = pos2.coords.longitude;

            // If coordinates are identical and it was already suspicious, flag it.
            if (lat1 === lat2 && lng1 === lng2 && isSuspicious) {
              return onError(new Error("⚠️ PERINGATAN: Terdeteksi penggunaan Fake GPS atau Lokasi Palsu. Harap matikan Fake GPS untuk absen."));
            }

            // If coordinates are perfectly identical but not in suspicious accuracy list,
            // it still might be fake, but we'll be slightly more lenient or we could just flag it anyway.
            // Many fake GPS apps have exactly static coords. Let's flag if exactly identical.
            // However, desktop browsers (WiFi location) also have exactly static coords. 
            // So we rely on the combination of static + suspicious or just pass it if it's not a known fake pattern.
            
            // For now, if it passes, we use the second (fresher) position.
            onSuccess(pos2);
          },
          (err) => {
            // If the second request fails, just use the first one.
            onSuccess(pos1);
          },
          options
        );
      }, 800);
    },
    (err) => {
      let msg = "Harap aktifkan layanan lokasi (GPS) untuk absen.";
      if (err.code === 1) msg = "Izin ditolak. Izinkan akses lokasi di pengaturan browser Anda.";
      else if (err.code === 2) msg = "Lokasi tidak tersedia. Periksa sinyal GPS Anda.";
      else if (err.code === 3) msg = "Permintaan lokasi timeout.";
      
      onError(new Error(msg));
    },
    options
  );
};
