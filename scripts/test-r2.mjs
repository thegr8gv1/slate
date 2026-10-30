import { S3Client, ListObjectsV2Command, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Check for .env in apps/api or root
const envPath = existsSync(resolve('apps/api/.env')) 
  ? resolve('apps/api/.env') 
  : existsSync(resolve('apps/api/.env.txt'))
  ? resolve('apps/api/.env.txt')
  : resolve('.env');

if (!existsSync(envPath)) {
  console.error(`❌ No .env file found at ${envPath}`);
  process.exit(1);
}

const envConfig = {};
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    envConfig[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
}

const endpoint = envConfig.R2_S3_API || `https://${envConfig.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
const bucketName = envConfig.R2_BUCKET_NAME || 'slate-media';

const s3 = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: envConfig.R2_ACCESS_KEY_ID,
    secretAccessKey: envConfig.R2_SECRET_ACCESS_KEY,
  },
});

async function main() {
  console.log('--- Testing Cloudflare R2 Connection ---');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Bucket:   ${bucketName}`);

  try {
    const listRes = await s3.send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 5 }));
    console.log('✅ Connected to Cloudflare R2 successfully!');
    console.log(`✅ Bucket "${bucketName}" exists (items: ${listRes.KeyCount ?? 0})`);

    const testKey = `test-verify-${Date.now()}.txt`;
    const testContent = `Slate R2 verified at ${new Date().toISOString()}`;

    await s3.send(new PutObjectCommand({ Bucket: bucketName, Key: testKey, Body: testContent }));
    console.log('✅ Write test (PutObject) succeeded!');

    const getRes = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: testKey }));
    const readBack = await getRes.Body?.transformToString();
    console.log(`✅ Read test (GetObject) succeeded: "${readBack}"`);

    await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: testKey }));
    console.log('✅ Cleanup (DeleteObject) succeeded!');

    console.log('\n🎉 ALL CLOUDFLARE R2 CHECKS PASSED 100%!');
  } catch (err) {
    if (err.name === 'NoSuchBucket' || err.Code === 'NoSuchBucket') {
      console.log(`\n⚠️  AUTHENTICATION SUCCEEDED, but bucket "${bucketName}" does not exist yet.`);
      console.log(`👉 Please go to https://dash.cloudflare.com/ and create the bucket named "${bucketName}".`);
    } else {
      console.error('❌ R2 connection error:', err.name, err.message);
    }
  }
}

main();
