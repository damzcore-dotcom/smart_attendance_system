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

module.exports = {
  minioClient,
  deleteMinioObject
};
