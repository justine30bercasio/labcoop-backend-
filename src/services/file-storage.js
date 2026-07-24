const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'labcoop';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

const s3 = (R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

function isConfigured() {
  return s3 !== null;
}

async function uploadFile(buffer, key, contentType) {
  if (!s3) throw new Error('R2 not configured');
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream',
  }));
}

async function deleteFile(key) {
  if (!s3 || !key) return;
  try {
    await s3.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    }));
  } catch (e) {
    console.error('[R2] Delete failed:', e.message);
  }
}

function getPublicUrl(key) {
  if (!R2_PUBLIC_URL) return null;
  return `${R2_PUBLIC_URL}/${key}`;
}

function keyFromUrl(url) {
  if (!url) return null;
  if (R2_PUBLIC_URL && url.startsWith(R2_PUBLIC_URL)) {
    return url.slice(R2_PUBLIC_URL.length + 1);
  }
  if (url.startsWith('/uploads/')) {
    return url.slice(9);
  }
  return null;
}

module.exports = { uploadFile, deleteFile, getPublicUrl, keyFromUrl, isConfigured };
