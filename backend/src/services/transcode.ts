import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { prisma } from './prisma'
import { isS3Enabled, uploadToS3, S3_BUCKET_NAME, s3Client } from './s3'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'

const TV_PROFILE = {
  scale: '-2:720',      // 720p, auto width
  videoCodec: 'libx264',
  profile: 'main',
  level: '4.1',
  preset: 'fast',
  crf: '23',
  maxrate: '5M',
  bufsize: '10M',
  audioCodec: 'aac',
  audioBitrate: '128k',
}

function ffmpegTranscode(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vf', `scale=${TV_PROFILE.scale}`,
      '-c:v', TV_PROFILE.videoCodec,
      '-profile:v', TV_PROFILE.profile,
      '-level', TV_PROFILE.level,
      '-preset', TV_PROFILE.preset,
      '-crf', TV_PROFILE.crf,
      '-maxrate', TV_PROFILE.maxrate,
      '-bufsize', TV_PROFILE.bufsize,
      '-c:a', TV_PROFILE.audioCodec,
      '-b:a', TV_PROFILE.audioBitrate,
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]

    console.log('[Transcode] Starting FFmpeg:', args.join(' '))
    const startTime = Date.now()
    const proc = spawn('ffmpeg', args, { stdio: 'pipe' })

    let stderr = ''
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      if (code === 0) {
        console.log(`[Transcode] Done in ${elapsed}s: ${outputPath}`)
        resolve()
      } else {
        console.error(`[Transcode] FFmpeg failed (code ${code}):`, stderr.slice(-500))
        reject(new Error(`FFmpeg exited with code ${code}`))
      }
    })

    proc.on('error', (err) => {
      console.error('[Transcode] FFmpeg spawn error:', err.message)
      reject(err)
    })
  })
}

async function downloadFromS3(s3Key: string, localPath: string): Promise<void> {
  if (!s3Client) throw new Error('S3 not configured')
  const { GetObjectCommand } = await import('@aws-sdk/client-s3')
  const res = await s3Client.send(new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: s3Key,
  }))
  if (!res.Body) throw new Error('Empty S3 response body')
  const chunks: Buffer[] = []
  for await (const chunk of res.Body as any) {
    chunks.push(Buffer.from(chunk))
  }
  fs.writeFileSync(localPath, Buffer.concat(chunks))
}

export async function transcodeForTV(mediaId: string): Promise<void> {
  const media = await prisma.media.findUnique({ where: { id: mediaId } })
  if (!media) {
    console.warn('[Transcode] Media not found:', mediaId)
    return
  }
  if (media.type !== 'VIDEO') {
    console.log('[Transcode] Skip non-video:', media.filename)
    return
  }
  if (media.tvFilename) {
    console.log('[Transcode] Already has TV version:', media.tvFilename)
    return
  }

  const originalKey = media.url.replace(/^\//, '')
  const tvFilename = `tv-${media.filename}`
  const tvS3Key = `uploads/${tvFilename}`
  const tvUrl = `/${tvS3Key}`

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-transcode-'))
  const inputPath = path.join(tmpDir, 'input' + path.extname(media.filename))
  const outputPath = path.join(tmpDir, tvFilename)

  try {
    // Download original to temp
    if (isS3Enabled) {
      await downloadFromS3(originalKey, inputPath)
    } else {
      const localOriginal = path.join(__dirname, '../../uploads', media.filename)
      if (!fs.existsSync(localOriginal)) {
        throw new Error(`Original file not found: ${localOriginal}`)
      }
      fs.copyFileSync(localOriginal, inputPath)
    }

    // Transcode
    await ffmpegTranscode(inputPath, outputPath)

    // Upload TV version
    if (isS3Enabled) {
      const buffer = fs.readFileSync(outputPath)
      await uploadToS3(tvS3Key, buffer, 'video/mp4')
    } else {
      const tvDir = path.join(__dirname, '../../uploads')
      if (!fs.existsSync(tvDir)) fs.mkdirSync(tvDir, { recursive: true })
      fs.copyFileSync(outputPath, path.join(tvDir, tvFilename))
    }

    // Update DB
    await prisma.media.update({
      where: { id: mediaId },
      data: { tvFilename, tvUrl },
    })

    console.log('[Transcode] TV version created:', tvFilename)
  } catch (err: any) {
    console.error('[Transcode] Failed:', err.message)
    // Clean up partial TV file if it exists
    try {
      if (isS3Enabled && s3Client) {
        await s3Client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET_NAME, Key: tvS3Key }))
      } else {
        const localTv = path.join(__dirname, '../../uploads', tvFilename)
        if (fs.existsSync(localTv)) fs.unlinkSync(localTv)
      }
    } catch {}
    throw err
  } finally {
    // Clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {}
  }
}

export async function transcodeExistingVideos(): Promise<void> {
  const videos = await prisma.media.findMany({
    where: { type: 'VIDEO', tvFilename: null },
  })
  console.log(`[Transcode] Found ${videos.length} existing videos to transcode`)
  for (const media of videos) {
    try {
      await transcodeForTV(media.id)
    } catch (e: any) {
      console.error(`[Transcode] Failed for ${media.id}:`, e.message)
    }
  }
}
