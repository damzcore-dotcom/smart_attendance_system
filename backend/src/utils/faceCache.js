const prisma = require('../prismaClient');

// Key: employeeId (number), Value: { descriptors: Array<Array<number>>, employee: Object }
const faceCache = new Map();

/**
 * Initialize Face Cache in memory on startup
 */
async function initializeFaceCache() {
  try {
    console.log('⚡ Initializing Web Face Verification Cache in memory...');
    const employees = await prisma.employee.findMany({
      where: {
        faceStatus: 'ENROLLED',
        faceDescriptor: { not: null },
        user: { isNot: null }
      },
      include: {
        department: true,
        shift: true,
        user: true
      }
    });

    faceCache.clear();
    let loadedCount = 0;
    for (const emp of employees) {
      try {
        const storedData = Array.isArray(emp.faceDescriptor)
          ? emp.faceDescriptor
          : JSON.parse(emp.faceDescriptor);
        
        if (!storedData || !Array.isArray(storedData) || storedData.length === 0) continue;

        // Support both single flat array and array of arrays
        const isMultiDescriptor = Array.isArray(storedData[0]);
        const descriptors = isMultiDescriptor ? storedData : [storedData];
        
        // Store both the descriptors and the pre-fetched employee/user info so we can return it instantly
        faceCache.set(emp.id, {
          descriptors,
          employee: {
            ...emp,
            user: emp.user ? {
              id: emp.user.id,
              username: emp.user.username,
              role: emp.user.role,
              permissions: emp.user.role === 'SUPER_ADMIN' ? 'ALL' : emp.user.permissions
            } : null
          }
        });
        loadedCount++;
      } catch (parseErr) {
        console.error(`[FaceCache] Failed to parse descriptor for employee ${emp.id}:`, parseErr.message);
      }
    }
    console.log(`⚡ Face cache initialized successfully. Loaded ${loadedCount} active face accounts.`);
  } catch (err) {
    console.error('❌ Failed to initialize Face cache:', err.message);
  }
}

/**
 * Get active face cache Map
 */
function getFaceCache() {
  return faceCache;
}

/**
 * Update single cached face record
 */
function updateCachedFace(employeeId, faceDescriptor, employeeData) {
  try {
    if (!faceDescriptor) {
      faceCache.delete(employeeId);
      return;
    }
    const storedData = Array.isArray(faceDescriptor)
      ? faceDescriptor
      : JSON.parse(faceDescriptor);
    
    const isMultiDescriptor = Array.isArray(storedData[0]);
    const descriptors = isMultiDescriptor ? storedData : [storedData];

    faceCache.set(employeeId, {
      descriptors,
      employee: {
        ...employeeData,
        user: employeeData.user ? {
          id: employeeData.user.id,
          username: employeeData.user.username,
          role: employeeData.user.role,
          permissions: employeeData.user.role === 'SUPER_ADMIN' ? 'ALL' : employeeData.user.permissions
        } : null
      }
    });
    console.log(`⚡ Updated Face cache for employee ID: ${employeeId}`);
  } catch (e) {
    console.error(`[FaceCache] Failed to update cache for employee ${employeeId}:`, e.message);
  }
}

/**
 * Remove a face record from cache
 */
function removeCachedFace(employeeId) {
  faceCache.delete(employeeId);
  console.log(`⚡ Removed Face cache for employee ID: ${employeeId}`);
}

module.exports = {
  initializeFaceCache,
  getFaceCache,
  updateCachedFace,
  removeCachedFace
};
