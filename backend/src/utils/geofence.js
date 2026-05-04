/**
 * Geofence Utility
 * Uses Haversine formula to validate GPS distance
 */

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - User latitude
 * @param {number} lng1 - User longitude
 * @param {number} lat2 - Office latitude
 * @param {number} lng2 - Office longitude
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if user is within geofence radius
 * @param {number} userLat
 * @param {number} userLng
 * @param {number} officeLat
 * @param {number} officeLng
 * @param {number} radiusMeters
 * @returns {{ isWithin: boolean, distance: number }}
 */
function isWithinGeofence(userLat, userLng, officeLat, officeLng, radiusMeters) {
  const distance = haversineDistance(userLat, userLng, officeLat, officeLng);
  return {
    isWithin: distance <= radiusMeters,
    distance: Math.round(distance),
  };
}

module.exports = { haversineDistance, isWithinGeofence };
