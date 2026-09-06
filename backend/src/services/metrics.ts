import { Registry, collectDefaultMetrics, Histogram, Counter, Gauge } from 'prom-client'

export const register = new Registry()

collectDefaultMetrics({ register })

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
})

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [register],
})

export const activeDevicesGauge = new Gauge({
  name: 'active_devices',
  help: 'Number of devices currently online',
  registers: [register],
})

export const socketConnectionsGauge = new Gauge({
  name: 'socket_connections',
  help: 'Number of active Socket.io connections',
  registers: [register],
})

export const mediaUploadsTotal = new Counter({
  name: 'media_uploads_total',
  help: 'Total number of media uploads',
  registers: [register],
})

export const mediaDownloadsTotal = new Counter({
  name: 'media_downloads_total',
  help: 'Total number of signed URL generations (media downloads)',
  registers: [register],
})
