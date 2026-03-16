import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { protect } from '../middleware/auth'
import { AuthRequest, ApiResponse } from '../types'
import { transcodeQueue } from '../config/queue'

const router = Router()
// const prisma = new PrismaClient()

// GET /api/jobs/:jobId — get single job status
router.get(
  '/:jobId',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    // find job in Postgres — verify it belongs to this user via video relation
    const job = await prisma.job.findFirst({
      where: {
        id: req.params.jobId as string,
        video: { userId: req.user!.id },
      },
      include: {
        video: {
          include: { outputs: true },
        },
      },
    })

    if (!job) {
      res.status(404).json({
        success: false,
        message: 'Job not found',
      } as ApiResponse)
      return
    }

    // also get live progress from Bull (Redis)
    let bullProgress = 0
    let bullState = 'unknown'

    if (job.bullJobId) {
      try {
        const bullJob = await transcodeQueue.getJob(job.bullJobId)
        if (bullJob) {
          bullProgress = (bullJob.progress() as number) || 0
          bullState = await bullJob.getState()
        }
      } catch {
        // Bull job may have been cleaned up — use Postgres data
      }
    }

    res.status(200).json({
      success: true,
      data: {
        job: {
          id: job.id,
          bullJobId: job.bullJobId,
          status: job.status,
          progress: bullProgress || job.progress,
          errorMsg: job.errorMsg,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          createdAt: job.createdAt,
        },
        bullState,
        video: {
          id: job.video.id as string, 
          title: job.video.title,
          status: job.video.status,
          outputs: job.video.outputs,
        },
      },
    } as any)
  }
)

// GET /api/jobs — list all jobs for logged-in user
router.get(
  '/',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const skip = (page - 1) * limit

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where: { video: { userId: req.user!.id } },
        include: { video: { select: { id: true, title: true, status: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.job.count({
        where: { video: { userId: req.user!.id } },
      }),
    ])

    res.status(200).json({
      success: true,
      data: {
        jobs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    } as any)
  }
)

// GET /api/jobs/queue/stats — see overall queue health
router.get(
  '/queue/stats',
  protect,
  async (_req: AuthRequest, res: Response): Promise<void> => {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      transcodeQueue.getWaitingCount(),
      transcodeQueue.getActiveCount(),
      transcodeQueue.getCompletedCount(),
      transcodeQueue.getFailedCount(),
      transcodeQueue.getDelayedCount(),
    ])

    res.status(200).json({
      success: true,
      data: {
        queue: {
          waiting,
          active,
          completed,
          failed,
          delayed,
          total: waiting + active,
        },
      },
    } as any)
  }
)

export default router