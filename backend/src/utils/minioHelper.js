const Minio = require('minio');

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123'
});

/**
 * Delete an object from MinIO
 * @param {string} objectPath - E.g. "unknown-faces/unknown/20260603_154415.jpg"
 */
async function deleteMinioObject(objectPath) {
  if (!objectPath) return;
  try {
    // Expected path format: "bucket-name/folder/filename.jpg"
    const slashIndex = objectPath.indexOf('/');
    if (slashIndex === -1) {
      console.log(`[MinIO] Invalid object path format: ${objectPath}`);
      return;
    }
    const bucket = objectPath.substring(0, slashIndex);
    const objectKey = objectPath.substring(slashIndex + 1);

    await minioClient.removeObject(bucket, objectKey);
    console.log(`[MinIO] Successfully deleted object: ${bucket}/${objectKey}`);
  } catch (error) {
    console.error(`[MinIO] Error deleting object ${objectPath}:`, error.message);
  }
}

/**
 * Upload a Base64 encoded file/image to MinIO
 * @param {string} bucketName - E.g. "leave-attachments"
 * @param {string} base64Str - The Base64 encoded file string (might include data:image/png;base64, prefix)
 * @param {string} prefix - E.g. "medical"
 * @returns {Promise<string>} - Returns object path e.g. "leave-attachments/medical/filename.jpg"
 */
async function uploadBase64ToMinio(bucketName, base64Str, prefix) {
  if (!base64Str) return null;

  // Check and extract mime type and data from data URI if present
  let mimeType = 'image/jpeg';
  let extension = 'jpg';
  let dataStr = base64Str;

  if (base64Str.startsWith('data:')) {
    const matches = base64Str.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      dataStr = matches[2];
      // Get extension from mime type
      const parts = mimeType.split('/');
      if (parts.length === 2) {
        extension = parts[1];
      }
    }
  }

  // Ensure the bucket exists
  const bucketExists = await minioClient.bucketExists(bucketName);
  if (!bucketExists) {
    await minioClient.makeBucket(bucketName);
    console.log(`[MinIO] Created bucket: ${bucketName}`);
  }

  // Convert Base64 data to a Buffer
  const buffer = Buffer.from(dataStr, 'base64');
  
  // Verify size limit: 5MB = 5 * 1024 * 1024 bytes
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Ukuran file melebihi batas 5MB.');
  }

  // Generate a unique file name
  const timestamp = new Date().getTime();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const objectName = `${prefix}/${timestamp}_${randomStr}.${extension}`;

  // Upload buffer to MinIO
  await minioClient.putObject(bucketName, objectName, buffer, buffer.length, {
    'Content-Type': mimeType
  });

  console.log(`[MinIO] Uploaded base64 object to: ${bucketName}/${objectName}`);
  return `${bucketName}/${objectName}`;
}

module.exports = {
  minioClient,
  deleteMinioObject,
  uploadBase64ToMinio
};
