import 'express-async-errors'
import dotenv from 'dotenv'
dotenv.config()

import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import { validateEnv } from './config/env'
import authRoutes from './routes/auth'
import uploadRoutes from './routes/upload'
import videoRoutes from './routes/videos'
import transcodeRoutes from './routes/transcode'
import jobRoutes from './routes/jobs'

validateEnv()

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ─── Routes ───────────────────────────────────────────────────────
app.use('/api/auth', authRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/videos', videoRoutes)
app.use('/api/transcode', transcodeRoutes)
app.use('/api/jobs', jobRoutes)

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  })
})

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' })
})

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err.message)
  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong'
        : err.message,
  })
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
})

export default app