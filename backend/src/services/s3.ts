import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { mediaUploadsTotal, mediaDownloadsTotal } from './metrics'

const endpoint = process.env.S3_ENDPOINT
const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT || endpoint
const region = process.env.S3_REGION || 'us-east-1'
const accessKeyId = process.env.S3_ACCESS_KEY_ID
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
export const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || 'digital-signage-media'
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true'

export const isS3Enabled = !!(endpoint && accessKeyId && secretAccessKey)

export const s3Client = isS3Enabled
  ? new S3Client({
      endpoint: endpoint!,
      region,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
      forcePathStyle,
    })
  : null

export async function uploadToS3(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  if (!s3Client) throw new Error('S3 is not configured')
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )
  mediaUploadsTotal.inc()
  return key
}

export async function setupS3Bucket(): Promise<void> {
  if (!s3Client) return
  try {
    await s3Client.send(new CreateBucketCommand({ Bucket: S3_BUCKET_NAME }))
    console.log(`[S3] Created bucket: ${S3_BUCKET_NAME}`)
  } catch (err: any) {
    if (err.name === 'BucketAlreadyOwnedByYou' || err.name === 'BucketAlreadyExists') {
      console.log(`[S3] Bucket already exists: ${S3_BUCKET_NAME}`)
    } else {
      console.error('[S3] Failed to create bucket:', err.message)
    }
  }

  try {
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: '*',
          Action: 's3:GetObject',
          Resource: `arn:aws:s3:::${S3_BUCKET_NAME}/*`,
        },
      ],
    }
    await s3Client.send(
      new PutBucketPolicyCommand({
        Bucket: S3_BUCKET_NAME,
        Policy: JSON.stringify(policy),
      })
    )
    console.log(`[S3] Bucket ${S3_BUCKET_NAME} is now public-read`)
  } catch (err: any) {
    console.error('[S3] Failed to set bucket policy:', err.message)
  }
}

function getRequestHost(req: any): string | null {
  const forwardedHost = req.headers['x-forwarded-host']
  if (forwardedHost) {
    return String(forwardedHost).split(':')[0]
  }
  const host = req.headers.host
  if (host) {
    return String(host).split(':')[0]
  }
  return null
}

export function getPublicFileUrl(key: string, req?: any): string {
  let base = publicEndpoint || endpoint || ''
  // If base contains localhost and request comes from a remote client,
  // replace localhost with the actual server hostname/IP so external
  // devices (TVs) can reach MinIO/S3.
  if (base.includes('localhost') && req) {
    const actualHost = getRequestHost(req)
    if (actualHost && actualHost !== 'localhost' && actualHost !== '127.0.0.1') {
      base = base.replace(/localhost/, actualHost)
    }
  }
  // MinIO with path-style: http://localhost:9000/bucket/key
  return `${base}/${S3_BUCKET_NAME}/${key}`
}

export function resolvePublicUrl(url: string, req?: any): string {
  if (!url || !url.includes('localhost') || !req) return url

  const actualHost = getRequestHost(req)
  if (!actualHost || actualHost === 'localhost' || actualHost === '127.0.0.1') return url

  return url.replace(/localhost/, actualHost)
}

export async function getSignedFileUrl(key: string, expiresIn = 3600): Promise<string> {
  if (!s3Client) throw new Error('S3 is not configured')
  const command = new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key })
  mediaDownloadsTotal.inc()
  return getSignedUrl(s3Client, command, { expiresIn })
}

export async function downloadFromS3(key: string): Promise<Buffer> {
  if (!s3Client) throw new Error('S3 is not configured')
  const command = new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key })
  mediaDownloadsTotal.inc()
  const response = await s3Client.send(command)
  const chunks: Buffer[] = []
  for await (const chunk of response.Body as any) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

export async function deleteFromS3(key: string): Promise<void> {
  if (!s3Client) throw new Error('S3 is not configured')
  await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key }))
}

export async function fileExistsInS3(key: string): Promise<boolean> {
  if (!s3Client) return false
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key }))
    return true
  } catch {
    return false
  }
}
