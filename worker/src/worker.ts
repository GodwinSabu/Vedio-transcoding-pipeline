import dotenv from 'dotenv'
dotenv.config()

import Bull from 'bull'
import { PrismaClient, VideoStatus, JobStatus } from '@prisma/client'
import axios from 'axios'
import path from 'path'
import fs from 'fs' 
import os from 'os'
import { downloadFromS3, uploadToS3 } from './s3'
import { transcodeAll } from './ffmpeg'

// ── types (same as backend queue.ts) ──────────────────────────────
interface TranscodeJobData {
  videoId: string
  userId: string
  originalKey: string
  resolutions: string[]
  webhookUrl?: string
}

const prisma = new PrismaClient()

// connect to same Bull queue as backend
const transcodeQueue = new Bull<TranscodeJobData>('video-transcoding', {
  redis: process.env.REDIS_URL || 'redis://localhost:6379',
})

// max 5 concurrent jobs — same leaky bucket limit
const MAX_CONCURRENT = 5

console.log('Worker started — waiting for jobs...')

// ── main job processor ─────────────────────────────────────────────
transcodeQueue.process(MAX_CONCURRENT, async (job) => {
  const { videoId, originalKey, resolutions, webhookUrl } = job.data

  console.log(`\nProcessing job ${job.id} — videoId: ${videoId}`)
  console.log(`Resolutions: ${resolutions.join(', ')}`)

  // create a unique temp directory for this job
  const tempDir = path.join(os.tmpdir(), `transcode-${job.id}`)
  const inputPath = path.join(tempDir, 'input.mp4')
  const outputDir = path.join(tempDir, 'outputs')

  try {
    // ── Step 1: mark as processing ─────────────────────────────
    await Promise.all([
      prisma.video.update({
        where: { id: videoId },
        data: { status: VideoStatus.PROCESSING },
      }),
      prisma.job.updateMany({
        where: { bullJobId: job.id?.toString() },
        data: {
          status: JobStatus.PROCESSING,
          startedAt: new Date(),
        },
      }),
    ])

    await job.progress(5)

    // ── Step 2: download raw video from S3 ─────────────────────
    fs.mkdirSync(tempDir, { recursive: true })
    await downloadFromS3(originalKey, inputPath)
    await job.progress(15)

    // ── Step 3: transcode all resolutions ──────────────────────
    // track progress across all resolutions
    const resolutionProgress: Record<string, number> = {}
    resolutions.forEach((r) => (resolutionProgress[r] = 0))

    const results = await transcodeAll(
      inputPath,
      outputDir,
      resolutions,
      async (resolution, percent) => {
        resolutionProgress[resolution] = percent

        // overall progress = 15 (download) + weighted transcoding progress
        const avgProgress =
          Object.values(resolutionProgress).reduce((a, b) => a + b, 0) /
          resolutions.length

        // scale transcoding to 15-85% of total progress
        const totalProgress = 15 + Math.round(avgProgress * 0.7)
        await job.progress(totalProgress)
      }
    )

    await job.progress(85)

    // ── Step 4: upload outputs to S3 ───────────────────────────
    const outputRecords: { resolution: string; s3Key: string; fileSize: number }[] = []

    for (const result of results) {
      const s3Key = `transcoded/${videoId}/${result.resolution}.mp4`
      const fileSize = await uploadToS3(result.outputPath, s3Key)

      outputRecords.push({
        resolution: result.resolution,
        s3Key,
        fileSize,
      })
    }

    await job.progress(95)

    // ── Step 5: save outputs + update status in Postgres ───────
    await prisma.$transaction([
      // create output records
      prisma.output.createMany({
        data: outputRecords.map((o) => ({ ...o, videoId })),
      }),
      // mark video as done
      prisma.video.update({
        where: { id: videoId },
        data: { status: VideoStatus.DONE },
      }),
      // mark job as completed
      prisma.job.updateMany({
        where: { bullJobId: job.id?.toString() },
        data: {
          status: JobStatus.COMPLETED,
          progress: 100,
          completedAt: new Date(),
        },
      }),
    ])

    await job.progress(100)
    console.log(`Job ${job.id} completed successfully`)

    // ── Step 6: fire webhook if provided ───────────────────────
    if (webhookUrl) {
      try {
        await axios.post(
          webhookUrl,
          {
            event: 'video.transcoded',
            videoId,
            status: 'completed',
            outputs: outputRecords.map((o) => ({
              resolution: o.resolution,
              s3Key: o.s3Key,
              fileSize: o.fileSize,
            })),
            timestamp: new Date().toISOString(),
          },
          { timeout: 10000 }
        )
        console.log(`Webhook fired to ${webhookUrl}`)
      } catch (webhookError) {
        // webhook failure should not fail the job
        console.error('Webhook failed — job still marked complete:', webhookError)
      }
    }
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error)

    // mark as failed in Postgres
    await Promise.all([
      prisma.video.update({
        where: { id: videoId },
        data: { status: VideoStatus.FAILED },
      }),
      prisma.job.updateMany({
        where: { bullJobId: job.id?.toString() },
        data: {
          status: JobStatus.FAILED,
          errorMsg: error instanceof Error ? error.message : 'Unknown error',
        },
      }),
    ])

    throw error // re-throw so Bull marks the job as failed and retries
  } finally {
    // always clean up temp files — even if job failed
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
      console.log(`Cleaned up temp dir: ${tempDir}`)
    } catch {
      console.warn(`Could not clean temp dir: ${tempDir}`)
    }
  }
})

// ── graceful shutdown ──────────────────────────────────────────────
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received — shutting down worker gracefully`)

  await transcodeQueue.close()
  await prisma.$disconnect()

  console.log('Worker shut down cleanly')
  process.exit(0)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))