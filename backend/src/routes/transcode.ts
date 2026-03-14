import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { VideoStatus, JobStatus } from '../generated/prisma/client'
import { protect } from '../middleware/auth'
import { AuthRequest, ApiResponse } from '../types'
import { transcodeQueue, MAX_CONCURRENT_JOBS } from '../config/queue'

const router = Router()

// valid resolution options
const VALID_RESOLUTIONS = ['360p', '480p', '720p', '1080p']

// POST /api/transcode/:videoId
router.post(
  '/:videoId',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const videoId = req.params.videoId as string
    const { resolutions, webhookUrl } = req.body

    // validate resolutions
    if (!resolutions || !Array.isArray(resolutions) || resolutions.length === 0) {
      res.status(400).json({
        success: false,
        message: 'resolutions array is required e.g. ["360p","720p","1080p"]',
      } as ApiResponse)
      return
    }

    const invalidRes = resolutions.filter(
      (r: string) => !VALID_RESOLUTIONS.includes(r)
    )
    if (invalidRes.length > 0) {
      res.status(400).json({
        success: false,
        message: `Invalid resolutions: ${invalidRes.join(', ')}. Valid: ${VALID_RESOLUTIONS.join(', ')}`,
      } as ApiResponse)
      return
    }

    // find the video — must belong to this user
    const video = await prisma.video.findFirst({
      where: { id: videoId, userId: req.user!.id },
    })

    if (!video) {
      res.status(404).json({
        success: false,
        message: 'Video not found',
      } as ApiResponse)
      return
    }

    // prevent re-queuing a video already being processed
    if (
      video.status === VideoStatus.QUEUED ||
      video.status === VideoStatus.PROCESSING
    ) {
      res.status(400).json({
        success: false,
        message: `Video is already ${video.status.toLowerCase()}`,
      } as ApiResponse)
      return
    }

    // ── leaky bucket check ────────────────────────────────────────
    // count how many jobs are currently active or waiting
    const [activeCount, waitingCount] = await Promise.all([
      transcodeQueue.getActiveCount(),
      transcodeQueue.getWaitingCount(),
    ])

    const totalInFlight = activeCount + waitingCount

    // ── add job to Bull queue ─────────────────────────────────────
    const job = await transcodeQueue.add(
      {
        videoId: video.id,
        userId: req.user!.id,
        originalKey: video.originalKey,
        resolutions,
        webhookUrl: webhookUrl || video.webhookUrl || undefined,
      },
      {
        // if at max capacity, job waits — otherwise runs immediately
        priority: totalInFlight >= MAX_CONCURRENT_JOBS ? 2 : 1,
      }
    )

    // ── update video + create job record in Postgres ──────────────
    const [updatedVideo, jobRecord] = await Promise.all([
      prisma.video.update({
        where: { id: video.id },
        data: {
          status: VideoStatus.QUEUED,
          webhookUrl: webhookUrl || video.webhookUrl,
        },
      }),
      prisma.job.create({
        data: {
          bullJobId: job.id?.toString(),
          status: JobStatus.QUEUED,
          videoId: video.id,
        },
      }),
    ])

    res.status(201).json({
      success: true,
      message: 'Video queued for transcoding',
      data: {
        jobId: jobRecord.id,
        bullJobId: job.id,
        videoId: video.id,
        status: updatedVideo.status,
        resolutions,
        queuePosition: waitingCount + 1,
        activeJobs: activeCount,
        maxConcurrent: MAX_CONCURRENT_JOBS,
      },
    } as ApiResponse<{
      jobId: string
      bullJobId: string | undefined
      videoId: string
      status: string
      resolutions: string[]
      queuePosition: number
      activeJobs: number
      maxConcurrent: number
    }>)
  }
)

export default router