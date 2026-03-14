import { Response, Router } from 'express'
import { prisma } from '../lib/prisma'
import { protect } from '../middleware/auth'
import {
  AuthRequest,
  ApiResponse,
  CreateVideoBody,
  VideoResponse,
} from '../types'

const router = Router()

// ─── POST /api/videos — save video metadata after S3 upload ───────
router.post(
  '/',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { title, originalKey, fileSize, webhookUrl } =
      req.body as CreateVideoBody

    if (!title || !originalKey) {
      res.status(400).json({
        success: false,
        message: 'title and originalKey are required',
      } as ApiResponse)
      return
    }

    // verify the key belongs to this user
    // key format: raw/{userId}/{uuid}.ext
    const keyUserId = originalKey.split('/')[1]
    if (keyUserId !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized — this key does not belong to you',
      } as ApiResponse)
      return
    }

    const video = await prisma.video.create({
      data: {
        title,
        originalKey,
        fileSize: fileSize || null,
        webhookUrl: webhookUrl || null,
        userId: req.user!.id,
      },
      include: { outputs: true },
    })

    res.status(201).json({
      success: true,
      message: 'Video saved successfully',
      data: { video },
    } as ApiResponse<{ video: typeof video }>)
  }
)

// ─── GET /api/videos — list all videos for logged-in user ─────────
router.get(
  '/',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const skip = (page - 1) * limit

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where: { userId: req.user!.id },
        include: { outputs: true, jobs: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.video.count({ where: { userId: req.user!.id } }),
    ])

    res.status(200).json({
      success: true,
      data: {
        videos,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    } as ApiResponse<{ videos: typeof videos; pagination: { page: number; limit: number; total: number; totalPages: number } }>)
  }
)

// ─── GET /api/videos/:id — get single video with outputs ──────────
router.get(
  '/:id',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const id = req.params.id as string
    const video = await prisma.video.findFirst({
      where: {
        id,
        userId: req.user!.id, // ensure user owns this video
      },
      include: { outputs: true, jobs: true },
    })

    if (!video) {
      res.status(404).json({
        success: false,
        message: 'Video not found',
      } as ApiResponse)
      return
    }

    res.status(200).json({
      success: true,
      data: { video },
    } as ApiResponse<{ video: typeof video }>)
  } 
)

// ─── DELETE /api/videos/:id ───────────────────────────────────────
router.delete(
  '/:id',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const id = req.params.id as string
    const video = await prisma.video.findFirst({
      where: {
        id,
        userId: req.user!.id,
      },
    })

    if (!video) {
      res.status(404).json({
        success: false,
        message: 'Video not found',
      } as ApiResponse)
      return
    }

    // prisma cascade delete handles outputs + jobs automatically
    await prisma.video.delete({ where: { id } })

    res.status(200).json({
      success: true,
      message: 'Video deleted successfully',
    } as ApiResponse)
  }
)

export default router