import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { ioInstance } from '../services/socket'
import { authMiddleware, requireCentralAdmin } from '../middleware/auth'

const router = Router()

// Default fallback configuration if server.json is not present
const DEFAULT_CONFIG = {
  versionCode: 3,
  versionName: '1.2',
  apkUrl: 'https://tv.sbmoffice.net/MPL-Dash-TV.apk',
  releaseNotes: 'Calibrated server clock synchronization, live BST clock overlay, and instant schedule matching.'
}

function loadServerConfig() {
  try {
    const configPath = path.resolve(__dirname, '../../../config/server.json')
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8')
      const parsed = JSON.parse(raw)
      return {
        versionCode: parsed.latestAppVersion || DEFAULT_CONFIG.versionCode,
        versionName: parsed.latestAppVersionName || DEFAULT_CONFIG.versionName,
        apkUrl: parsed.apkUrl || DEFAULT_CONFIG.apkUrl,
        releaseNotes: parsed.releaseNotes || DEFAULT_CONFIG.releaseNotes
      }
    }
  } catch (e) {
    console.warn('Failed to read config/server.json, using defaults:', e)
  }
  return DEFAULT_CONFIG
}

// GET /api/app/version - TV Player auto-update check
router.get('/version', (req, res) => {
  const config = loadServerConfig()
  res.json(config)
})

// POST /api/app/broadcast-update - Instant update push via Socket.io (Central Admin)
router.post('/broadcast-update', authMiddleware, requireCentralAdmin, (req, res) => {
  const { versionCode, apkUrl, changelog } = req.body
  const config = loadServerConfig()

  const targetVersion = versionCode || config.versionCode
  const targetUrl = apkUrl || config.apkUrl
  const notes = changelog || config.releaseNotes

  if (!ioInstance) {
    return res.status(500).json({ error: 'Socket server not ready' })
  }

  ioInstance.emit('APP_UPDATE', {
    versionCode: targetVersion,
    apkUrl: targetUrl,
    changelog: notes
  })

  console.log(`Pushed instant APP_UPDATE: v${targetVersion} to all connected TVs`)
  res.json({
    success: true,
    message: `Update broadcasted for version ${targetVersion}`,
    targetUrl
  })
})

// POST /api/app/broadcast-migrate - Live migration push via Socket.io (Central Admin)
router.post('/broadcast-migrate', authMiddleware, requireCentralAdmin, (req, res) => {
  const { newUrl } = req.body
  if (!newUrl) {
    return res.status(400).json({ error: 'newUrl is required' })
  }

  if (!ioInstance) {
    return res.status(500).json({ error: 'Socket server not ready' })
  }

  ioInstance.emit('SERVER_MIGRATE', { newUrl })
  console.log(`Pushed SERVER_MIGRATE to: ${newUrl}`)
  res.json({
    success: true,
    message: `Server migration broadcasted to ${newUrl}`
  })
})

export { router as appUpdateRouter }
