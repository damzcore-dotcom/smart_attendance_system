const path = require('path');

/**
 * Validate numeric ID parameters to prevent NaN errors from parseInt.
 * Checks common param names: id, empId, docId, employeeId
 */
const validateId = (req, res, next) => {
  const paramNames = ['id', 'empId', 'docId', 'employeeId'];
  
  for (const name of paramNames) {
    if (req.params[name] !== undefined) {
      const value = parseInt(req.params[name]);
      if (isNaN(value) || value <= 0) {
        return res.status(400).json({ 
          success: false, 
          message: `Parameter '${name}' harus berupa angka positif yang valid.` 
        });
      }
    }
  }
  
  next();
};

/**
 * Validate that a file path stays within the allowed upload directory.
 * Prevents path traversal attacks (e.g., ../../etc/passwd).
 * @param {string} fileUrl - The relative URL from the database
 * @returns {{ safe: boolean, resolvedPath: string }}
 */
const validateSafePath = (fileUrl) => {
  if (!fileUrl) return { safe: false, resolvedPath: '' };
  
  const uploadDir = path.resolve(process.cwd(), 'public', 'uploads');
  const resolvedPath = path.resolve(process.cwd(), 'public', fileUrl);
  
  return {
    safe: resolvedPath.startsWith(uploadDir),
    resolvedPath
  };
};

/**
 * Format currency amount to Indonesian locale consistently
 * @param {number} amount 
 * @returns {string}
 */
const formatRupiah = (amount) => {
  if (typeof amount !== 'number' || isNaN(amount)) return '0';
  return amount.toLocaleString('id-ID');
};

/**
 * Global controller error handler to sanitize production errors and avoid stack trace leakage.
 * @param {object} res - Express response object
 * @param {Error} err - Error object
 * @param {string} contextName - Controller and method context name
 */
const handleControllerError = (res, err, contextName) => {
  console.error(`❌ [${contextName}] Error:`, err.message, err.stack);
  const isProd = process.env.NODE_ENV === 'production';
  return res.status(500).json({
    success: false,
    message: isProd ? 'Terjadi kesalahan internal pada server.' : err.message
  });
};

module.exports = { validateId, validateSafePath, formatRupiah, handleControllerError };
