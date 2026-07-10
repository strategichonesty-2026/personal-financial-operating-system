// Storage abstraction layer
// All file operations go through this interface
// Swap Cloudflare R2 for S3 or local storage without changing callers

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Validate env at startup
const requiredEnvVars = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
] as const;

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`${envVar} environment variable is not set`);
  }
}

// R2 client (S3-compatible)
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env['R2_ACCESS_KEY_ID']!,
    secretAccessKey: process.env['R2_SECRET_ACCESS_KEY']!,
  },
});

const BUCKET = process.env['R2_BUCKET_NAME']!;

// Upload a file to storage
// Returns the storage key
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

// Get a signed URL for temporary file access (1 hour default)
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

// Delete a file from storage
export async function deleteFile(key: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

// Generate a storage key for a statement file
// Format: statements/{userId}/{year}/{month}/{filename}
export function generateStatementKey(
  userId: string,
  filename: string
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const timestamp = now.getTime();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `statements/${userId}/${year}/${month}/${timestamp}_${safeName}`;
}
