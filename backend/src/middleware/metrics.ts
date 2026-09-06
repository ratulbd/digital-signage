import { Request, Response, NextFunction } from 'express'
import { httpRequestDuration, httpRequestsTotal } from '../services/metrics'

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint()
  const route = req.route?.path || req.path

  const originalEnd = res.end.bind(res)
  res.end = function (chunk?: any, encoding?: any, cb?: any) {
    res.end = originalEnd
    const duration = Number(process.hrtime.bigint() - start) / 1e9
    const status = res.statusCode.toString()
    const labels = { method: req.method, route, status }

    httpRequestDuration.observe(labels, duration)
    httpRequestsTotal.inc(labels)

    return originalEnd(chunk, encoding, cb)
  }

  next()
}
