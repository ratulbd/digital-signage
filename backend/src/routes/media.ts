import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import * as googleTTS from 'google-tts-api'
import mammoth from 'mammoth'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Safe polyfill for environments where DOMMatrix is missing (e.g. Node 18)
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {}
}
import { prisma } from '../services/prisma'
import { authMiddleware, requireCompanyAdmin } from '../middleware/auth'
import { AuthRequest, ROLES, MEDIA_TYPES, rolePowerLevel } from '../types'
import { logAction } from '../services/audit'
import {
  isS3Enabled,
  uploadToS3,
  downloadFromS3,
  deleteFromS3,
  getPublicFileUrl,
  getSignedFileUrl,
  fileExistsInS3,
} from '../services/s3'
import { transcodeForTV } from '../services/transcode'

const router = Router()

// ── AI Narrative Extraction Helper ───────────────────────────────────────────
async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  if (!fs.existsSync(filePath)) return ''
  const dataBuffer = fs.readFileSync(filePath)
  return extractTextFromBuffer(dataBuffer, ext)
}

async function extractTextFromBuffer(buffer: Buffer, ext: string): Promise<string> {
  try {
    if (ext === '.pdf') {
      const pdf = require('pdf-parse')
      const data = await pdf(buffer)
      return data.text || ''
    } else if (ext === '.docx') {
      const data = await mammoth.extractRawText({ buffer })
      return data.value || ''
    } else if (['.txt', '.md'].includes(ext)) {
      return buffer.toString('utf-8')
    }
  } catch (err: any) {
    console.error(`[Extract] Failed to extract ${ext}:`, err.message)
  }
  return ''
}

async function generateWithRetry(genAI: GoogleGenerativeAI, prompt: string, preferredModel = 'gemini-2.5-flash', fallbackModel = 'gemini-3-flash') {
  const models = [preferredModel, fallbackModel]
  let lastError: any = null
  for (const modelName of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName })
        const result = await model.generateContent(prompt)
        return result.response.text()
      } catch (err: any) {
        lastError = err
        const status = err?.status || err?.message?.match(/(\d{3})/)?.[1]
        const isRetryable = status === '503' || status === '429' || err?.message?.includes('high demand')
        if (isRetryable && attempt === 0) {
          console.warn(`Model ${modelName} busy (${status}), retrying in 2s...`)
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        break // Don't retry non-retryable errors or second attempt
      }
    }
  }
  throw lastError
}

async function generateAIContent(media: any) {
  try {
    const ext = path.extname(media.filename).toLowerCase()
    let text = ''

    // Try local file first
    const filePath = path.join(__dirname, '../../uploads', media.filename)
    if (fs.existsSync(filePath)) {
      text = await extractText(filePath)
    }

    // If not found locally, download from S3/MinIO or backend URL
    if (!text && media.url) {
      try {
        let buffer: Buffer | null = null
        const s3Key = media.url.replace(/^\//, '')

        if (isS3Enabled && await fileExistsInS3(s3Key)) {
          // Download directly from S3 using internal Docker network
          console.log(`[Extract] Downloading from S3: ${s3Key}`)
          buffer = await downloadFromS3(s3Key)
          console.log(`[Extract] S3 download complete: ${buffer.length} bytes`)
        } else if (!isS3Enabled) {
          // Local file served by backend
          const url = `${process.env.API_URL || 'http://localhost:3001'}${media.url}`
          console.log(`[Extract] Downloading from ${url}`)
          const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
          if (res.ok) {
            buffer = Buffer.from(await res.arrayBuffer())
          } else {
            console.error(`[Extract] Download failed: HTTP ${res.status}`)
          }
        }

        if (buffer && buffer.length > 0) {
          text = await extractTextFromBuffer(buffer, ext)
          console.log(`[Extract] Extracted text length: ${text.length}`)
        }
      } catch (dlErr: any) {
        console.error('[Extract] Download error:', dlErr.message)
      }
    }

    if (!text || text.length < 5) {
      console.warn(`[Extract] No text extracted for ${media.id} (${media.filename}), setting fallback`)
      // Set a fallback so the player doesn't loop forever
      await prisma.media.update({
        where: { id: media.id },
        data: { narrative: '[No extractable text found in this document.]' }
      })
      return
    }

    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) {
      await prisma.media.update({
        where: { id: media.id },
        data: { narrative: text }
      })
      return
    }

    const genAI = new GoogleGenerativeAI(geminiKey)

    // 1. Generate narrative
    let narrative = text
    try {
      const narrativePrompt = `You are a professional narrator.
Please rewrite the following text into a smooth, professional, and engaging narrative script suitable for an audiobook.
Preserve all key facts but make the flow natural for speech.
If it is in Bengali, keep it in Bengali but professional.
Return ONLY the rewritten text.

TEXT:
${text.substring(0, 8000)}`
      narrative = await generateWithRetry(genAI, narrativePrompt)
      console.log(`[AI] Narrative generated for ${media.id}, length: ${narrative.length}`)
    } catch (narrErr) {
      console.error('[AI] Narrative generation failed:', (narrErr as any)?.message || narrErr)
      narrative = text
    }

    // 2. Save narrative to DB
    await prisma.media.update({
      where: { id: media.id },
      data: { narrative }
    })
  } catch (err) {
    console.error('AI content generation failed:', err)
  }
}

// ── TTS and Narrative Routes (Top level to avoid 404s) ─────────────────────────

// Public endpoint for TV player to get narrative text
router.post('/narrative', async (req, res) => {
  try {
    const { mediaId } = req.body
    const media = await prisma.media.findUnique({ where: { id: mediaId } })
    if (!media) return res.status(404).json({ error: 'Media not found' })

    // If narrative is missing, regenerate in background
    if (!media.narrative) {
      generateAIContent(media).catch(e => console.error('[AI] Background generation error:', e))
    }

    res.json({
      text: media.narrative || ''
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

router.post('/tts', async (req, res) => {
  try {
    const { text, lang = 'bn' } = req.body
    if (!text) return res.status(400).json({ error: 'Text required' })

    // Split text into chunks and convert to base64 to handle long narrations
    const results = await googleTTS.getAllAudioBase64(text, {
      lang: lang,
      slow: false,
      host: 'https://translate.google.com',
    })

    const buffers = results.map(r => Buffer.from(r.base64, 'base64'))
    const finalBuffer = Buffer.concat(buffers)

    res.set('Content-Type', 'audio/mpeg')
    res.send(finalBuffer)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

const storage = multer.memoryStorage()
const upload = multer({ storage })

function detectMediaType(mimeType: string): string | null {
  if (mimeType.startsWith('image/')) return MEDIA_TYPES.IMAGE
  if (mimeType.startsWith('video/')) return MEDIA_TYPES.VIDEO
  if (
    mimeType === 'application/pdf' ||
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.ms-powerpoint' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) return MEDIA_TYPES.DOCUMENT
  if (
    mimeType === 'text/plain' ||
    mimeType === 'text/csv' ||
    mimeType === 'text/markdown'
  ) return MEDIA_TYPES.TEXT
  return null
}

const mediaInclude = {
  uploader: { select: { id: true, email: true, name: true, role: true } },
  category: { select: { id: true, name: true } },
  contentType: { select: { id: true, name: true } },
}

// ── Upload ────────────────────────────────────────────────────────────────────
router.post('/upload', authMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const mimeType = req.file.mimetype
    const type = detectMediaType(mimeType)
    if (!type) return res.status(400).json({ error: 'Unsupported file type' })

    const { categoryId, contentTypeId, contentName } = req.body

    // Resolve uploader's hierarchy for scoping
    const uploader = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        subcenter: { include: { circle: true } },
        circle: true,
      },
    })

    const companyId = uploader?.companyId
      || uploader?.circle?.companyId
      || uploader?.subcenter?.circle?.companyId
      || null

    const circleId = uploader?.circleId
      || uploader?.subcenter?.circleId
      || null

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const filename = req.file.fieldname + '-' + uniqueSuffix + path.extname(req.file.originalname)
    const s3Key = `uploads/${filename}`

    // Upload to S3 if enabled, otherwise fall back to local disk
    if (isS3Enabled) {
      await uploadToS3(s3Key, req.file.buffer, mimeType)
    } else {
      const uploadsDir = path.join(__dirname, '../../uploads')
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer)
    }

    const data: any = {
      filename,
      url: `/${s3Key}`,
      type,
      size: req.file.size,
      uploadedBy: req.user!.id,
      companyId,
      circleId,
    }

    if (categoryId) data.categoryId = categoryId
    if (contentTypeId) data.contentTypeId = contentTypeId
    if (contentName) data.contentName = contentName

    // Enforce uniqueness: contentName must be unique within the same category + type
    if (contentName && categoryId && contentTypeId) {
      const existing = await prisma.media.findFirst({
        where: {
          contentName: contentName.trim(),
          categoryId,
          contentTypeId,
        },
      })
      if (existing) {
        return res.status(409).json({
          error: `Content name "${contentName}" already exists for this category and type`,
        })
      }
    }

    const media = await prisma.media.create({ data })

    // Trigger AI content generation in the background during upload
    if (type === MEDIA_TYPES.DOCUMENT || type === MEDIA_TYPES.TEXT) {
      generateAIContent(media).catch(e => console.error('Background AI content error:', e))
    }

    // Trigger TV-optimized transcoding in background for videos
    if (type === MEDIA_TYPES.VIDEO) {
      transcodeForTV(media.id).catch(e => console.error('Background transcode error:', e))
    }

    const url = isS3Enabled
      ? getPublicFileUrl(s3Key)
      : `${process.env.API_URL || 'http://localhost:3001'}${media.url}`
    res.status(201).json({ ...media, url })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── GET all media ─ split into own + public ───────────────────────────────────
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const uploadsDir = path.join(__dirname, '../../uploads')
    const API_URL = process.env.API_URL || 'http://localhost:3001'

    const addUrl = async (m: any) => {
      let url = m.url
      if (!m.url?.startsWith('http')) {
        if (isS3Enabled) {
          url = getPublicFileUrl(m.url.replace(/^\//, ''))
        } else {
          url = `${API_URL}${m.url}`
        }
      }
      let tvUrl = m.tvUrl
      if (tvUrl && !tvUrl.startsWith('http')) {
        if (isS3Enabled) {
          tvUrl = getPublicFileUrl(tvUrl.replace(/^\//, ''))
        } else {
          tvUrl = `${API_URL}${tvUrl}`
        }
      }
      return { ...m, url, tvUrl }
    }

    const filterExisting = async (items: any[]) => {
      if (isS3Enabled) {
        const checks = await Promise.all(
          items.map(async (m) => ({
            m,
            exists: await fileExistsInS3(m.url.replace(/^\//, '')),
          }))
        )
        return checks.filter((c) => c.exists).map((c) => c.m)
      }
      return items.filter((m) => fs.existsSync(path.join(uploadsDir, m.filename)))
    }

    const resolve = async (items: any[]) => {
      const existing = await filterExisting(items)
      return Promise.all(existing.map(addUrl))
    }

    if (req.user?.role === ROLES.CENTRAL_ADMIN) {
      const own = await prisma.media.findMany({
        include: mediaInclude,
        orderBy: { createdAt: 'desc' },
      })
      const publicMedia = await prisma.media.findMany({
        where: { isPublic: true },
        include: mediaInclude,
        orderBy: { createdAt: 'desc' },
      })
      return res.json({ own: await resolve(own), public: await resolve(publicMedia) })
    }

    if (req.user?.role === ROLES.COMPANY_ADMIN && req.user.companyId) {
      const own = await prisma.media.findMany({
        where: { companyId: req.user.companyId },
        include: mediaInclude,
        orderBy: { createdAt: 'desc' },
      })
      const publicMedia = await prisma.media.findMany({
        where: {
          companyId: req.user.companyId,
          isPublic: true,
        },
        include: mediaInclude,
        orderBy: { createdAt: 'desc' },
      })
      return res.json({ own: await resolve(own), public: await resolve(publicMedia) })
    }

    if (req.user?.role === ROLES.CIRCLE_ADMIN && req.user.circleId) {
      const own = await prisma.media.findMany({
        where: { circleId: req.user.circleId },
        include: mediaInclude,
        orderBy: { createdAt: 'desc' },
      })
      const publicFromCompany = await prisma.media.findMany({
        where: {
          companyId: req.user.companyId || undefined,
          isPublic: true,
          publishedBy: 'COMPANY',
        },
        include: mediaInclude,
        orderBy: { createdAt: 'desc' },
      })
      return res.json({
        own: await resolve(own),
        public: await resolve(publicFromCompany),
      })
    }

    if (req.user?.role === ROLES.SUBCENTER_ADMIN) {
      const userFull = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: {
          subcenter: { include: { circle: true } },
          circle: true,
        },
      })
      const circleId = req.user.circleId || userFull?.subcenter?.circleId
      const companyId = req.user.companyId
        || userFull?.circle?.companyId
        || userFull?.subcenter?.circle?.companyId

      const own = await prisma.media.findMany({
        where: { uploadedBy: req.user.id },
        include: mediaInclude,
        orderBy: { createdAt: 'desc' },
      })

      const publicMedia = await prisma.media.findMany({
        where: {
          isPublic: true,
          OR: [
            { publishedBy: 'COMPANY', companyId: companyId || undefined },
            { publishedBy: 'CIRCLE', circleId: circleId || undefined },
          ],
        },
        include: mediaInclude,
        orderBy: { createdAt: 'desc' },
      })

      return res.json({
        own: await resolve(own),
        public: await resolve(publicMedia),
      })
    }

    return res.status(403).json({ error: 'Forbidden' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ═══════════════════════════════════════════════════════════════════════════════
//  CATEGORY & CONTENT TYPE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

function getUserCompanyId(user: AuthRequest['user']): string | null {
  if (!user) return null
  return user.companyId || null
}

// ── Categories ────────────────────────────────────────────────────────────────

// GET /categories — list visible to user (global + own company)
router.get('/categories', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const companyId = getUserCompanyId(req.user)
    const categories = await prisma.mediaCategory.findMany({
      where: {
        OR: [
          { companyId: null },
          { companyId: companyId || undefined },
        ],
      },
      include: {
        _count: { select: { media: true, types: true } },
        types: {
          include: { _count: { select: { media: true } } },
        },
      },
      orderBy: { name: 'asc' },
    })
    res.json(categories)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /categories — create (Company Admin+)
router.post('/categories', authMiddleware, requireCompanyAdmin, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name is required' })

    const companyId = req.user!.role === ROLES.CENTRAL_ADMIN ? null : (getUserCompanyId(req.user) || null)

    const category = await prisma.mediaCategory.create({
      data: { name: name.trim(), companyId },
    })
    res.status(201).json(category)
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Category already exists' })
    res.status(500).json({ error: err.message })
  }
})

// DELETE /categories/:id — delete if no media
const handleCategoryDelete = async (req: AuthRequest, res: any) => {
  try {
    const id = req.params.id as string
    const category = await prisma.mediaCategory.findUnique({
      where: { id },
      include: {
        _count: { select: { media: true } },
        types: {
          include: { _count: { select: { media: true } } },
        },
      },
    })
    if (!category) return res.status(404).json({ error: 'Category not found' })

    const typeMediaCount = category.types.reduce((acc, t) => acc + (t._count?.media || 0), 0)
    if (category._count.media > 0 || typeMediaCount > 0) {
      return res.status(409).json({ error: 'Cannot delete category with existing media' })
    }

    // Delete child types first to maintain clean referential integrity
    await prisma.mediaContentType.deleteMany({ where: { categoryId: id } })
    await prisma.mediaCategory.delete({ where: { id } })
    res.json({ message: 'Category deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.delete('/categories/:id', authMiddleware, requireCompanyAdmin, handleCategoryDelete)
router.post('/categories/:id/delete', authMiddleware, requireCompanyAdmin, handleCategoryDelete)

// ── Types ─────────────────────────────────────────────────────────────────────

// GET /categories/:id/types — list types for a category
router.get('/categories/:id/types', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const companyId = getUserCompanyId(req.user)
    const types = await prisma.mediaContentType.findMany({
      where: {
        categoryId: id,
        OR: [
          { companyId: null },
          { companyId: companyId || undefined },
        ],
      },
      include: { _count: { select: { media: true } } },
      orderBy: { name: 'asc' },
    })
    res.json(types)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /types — create type under category (Company Admin+)
router.post('/types', authMiddleware, requireCompanyAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, categoryId } = req.body
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name is required' })
    if (!categoryId || typeof categoryId !== 'string') return res.status(400).json({ error: 'Category ID is required' })

    const companyId = req.user!.role === ROLES.CENTRAL_ADMIN ? null : (getUserCompanyId(req.user) || null)

    const type = await prisma.mediaContentType.create({
      data: { name: name.trim(), categoryId, companyId },
    })
    res.status(201).json(type)
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Type already exists in this category' })
    res.status(500).json({ error: err.message })
  }
})

// DELETE /types/:id — delete if no media
const handleTypeDelete = async (req: AuthRequest, res: any) => {
  try {
    const id = req.params.id as string
    const type = await prisma.mediaContentType.findUnique({
      where: { id },
      include: { _count: { select: { media: true } } },
    })
    if (!type) return res.status(404).json({ error: 'Type not found' })

    if (type._count.media > 0) {
      return res.status(409).json({ error: 'Cannot delete type with existing media' })
    }

    await prisma.mediaContentType.delete({ where: { id } })
    res.json({ message: 'Type deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.delete('/types/:id', authMiddleware, requireCompanyAdmin, handleTypeDelete)
router.post('/types/:id/delete', authMiddleware, requireCompanyAdmin, handleTypeDelete)

// ── GET single media ──────────────────────────────────────────────────────────
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const media = await prisma.media.findUnique({
      where: { id: req.params.id as string },
      include: mediaInclude,
    })
    if (!media) return res.status(404).json({ error: 'Media not found' })

    const s3Key = media.url.replace(/^\//, '')
    if (isS3Enabled) {
      const exists = await fileExistsInS3(s3Key)
      if (!exists) return res.status(404).json({ error: 'Media file not found in storage' })
    } else {
      const filePath = path.join(__dirname, '../../uploads', media.filename)
      if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Media file not found on disk' })
    }

    let url = media.url
    if (!media.url?.startsWith('http')) {
      if (isS3Enabled) {
        url = getPublicFileUrl(s3Key)
      } else {
        url = `${process.env.API_URL || 'http://localhost:3001'}${media.url}`
      }
    }
    res.json({ ...media, url })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ── PATCH /:id/publish & POST /:id/publish ────────────────────────────────────
const handleMediaPublish = async (req: AuthRequest, res: any) => {
  try {
    const { id } = req.params as { id: string }
    const { isPublic } = req.body

    const media = await prisma.media.findUnique({ where: { id } })
    if (!media) return res.status(404).json({ error: 'Media not found' })

    const role = req.user!.role
    if (role === ROLES.SUBCENTER_ADMIN) {
      return res.status(403).json({ error: 'Subcenter admins cannot publish media' })
    }

    let publishedBy = 'COMPANY'
    if (role === ROLES.CIRCLE_ADMIN) {
      if (media.circleId !== req.user!.circleId) {
        return res.status(403).json({ error: 'Media is not in your circle' })
      }
      publishedBy = 'CIRCLE'
    } else if (role === ROLES.COMPANY_ADMIN) {
      if (media.companyId !== req.user!.companyId) {
        return res.status(403).json({ error: 'Media is not in your company' })
      }
      publishedBy = 'COMPANY'
    }

    const updated = await prisma.media.update({
      where: { id },
      data: {
        isPublic: isPublic !== false,
        publishedBy: isPublic !== false ? publishedBy : 'SUBCENTER',
      },
    })

    await logAction({
      userId: req.user!.id,
      action: 'PUBLISH_MEDIA',
      target: `Media:${id}`,
      changes: { isPublic: updated.isPublic, publishedBy: updated.publishedBy },
      ipAddress: req.ip,
    })

    let url = updated.url
    if (!updated.url?.startsWith('http')) {
      if (isS3Enabled) {
        url = getPublicFileUrl(updated.url.replace(/^\//, ''))
      } else {
        url = `${process.env.API_URL || 'http://localhost:3001'}${updated.url}`
      }
    }
    res.json({ ...updated, url })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.patch('/:id/publish', authMiddleware, handleMediaPublish)
router.post('/:id/publish', authMiddleware, handleMediaPublish)

// ── DELETE media & POST /:id/delete ──────────────────────────────────────────
const handleMediaDelete = async (req: AuthRequest, res: any) => {
  try {
    const id = req.params.id as string
    const media = await prisma.media.findUnique({ where: { id } })
    if (!media) return res.status(404).json({ error: 'Media not found' })

    if (
      req.user?.role === ROLES.SUBCENTER_ADMIN &&
      media.uploadedBy !== req.user.id
    ) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Check for dependent schedules
    const scheduleCount = await prisma.scheduleItem.count({
      where: { mediaId: id },
    })
    if (scheduleCount > 0) {
      const force = req.query.force === 'true'
      if (!force) {
        return res.status(409).json({
          error: `Cannot delete media — it is used in ${scheduleCount} schedule(s). Remove from schedules first, or use Force Delete.`,
          scheduleCount,
          canForceDelete: true,
        })
      }
      // Force delete: remove all schedule references first
      await prisma.scheduleItem.deleteMany({ where: { mediaId: id } })
    }

    await logAction({
      userId: req.user!.id,
      action: 'DELETE_MEDIA',
      target: `Media:${id}`,
      changes: { filename: media.filename },
      ipAddress: req.ip,
    })

    if (isS3Enabled) {
      await deleteFromS3(media.url.replace(/^\//, ''))
      if (media.tvUrl) await deleteFromS3(media.tvUrl.replace(/^\//, ''))
    } else {
      const filePath = path.join(__dirname, '../../uploads', media.filename)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
      if (media.tvFilename) {
        const tvPath = path.join(__dirname, '../../uploads', media.tvFilename)
        if (fs.existsSync(tvPath)) fs.unlinkSync(tvPath)
      }
    }

    await prisma.media.delete({ where: { id } })
    res.json({ message: 'Media deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

router.delete('/:id', authMiddleware, handleMediaDelete)
router.post('/:id/delete', authMiddleware, handleMediaDelete)


// POST /api/media/transcode-existing — retroactively transcode all existing videos
router.post('/transcode-existing', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const videos = await prisma.media.findMany({
      where: { type: 'VIDEO', tvFilename: null },
    })
    console.log(`[Transcode] Retroactive: ${videos.length} videos queued`)
    // Process sequentially to avoid overwhelming the server
    let processed = 0
    for (const media of videos) {
      try {
        await transcodeForTV(media.id)
        processed++
      } catch (e: any) {
        console.error(`[Transcode] Failed for ${media.id}:`, e.message)
      }
    }
    res.json({ message: `Transcoded ${processed} of ${videos.length} videos` })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export { router as mediaRouter }
