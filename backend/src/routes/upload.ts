import { Response, Router } from 'express'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'
import { s3Client } from '../config/s3'
import { protect } from '../middleware/auth'
import { AuthRequest, ApiResponse, PresignedUrlResponse } from '../types'
import { env } from '../config/env'

const router = Router()

// allowed video types
const ALLOWED_TYPES = [
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',  // .avi
  'video/webm',
]

// max file size — 500MB
const MAX_FILE_SIZE = 500 * 1024 * 1024

// GET /api/upload/presigned-url?filename=myvideo.mp4&filetype=video/mp4&filesize=52428800
router.get(
  '/presigned-url',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { filename, filetype, filesize } = req.query

    // validate query params
    if (!filename || !filetype) {
      res.status(400).json({
        success: false,
        message: 'filename and filetype are required query parameters',
      } as ApiResponse)
      return
    }

    if (!ALLOWED_TYPES.includes(filetype as string)) {
      res.status(400).json({
        success: false,
        message: `File type not allowed. Allowed types: ${ALLOWED_TYPES.join(', ')}`,
      } as ApiResponse)
      return
    }

    if (filesize && parseInt(filesize as string) > MAX_FILE_SIZE) {
      res.status(400).json({
        success: false,
        message: 'File size exceeds 500MB limit',
      } as ApiResponse)
      return
    }

    // generate a unique S3 key
    // structure: raw/{userId}/{uuid}-{originalfilename}
    // this makes it easy to find all raw uploads for a user
    const fileExtension = (filename as string).split('.').pop()
    const uniqueKey = `raw/${req.user!.id}/${uuidv4()}.${fileExtension}`

    const command = new PutObjectCommand({
      Bucket: env.aws.s3BucketName,
      Key: uniqueKey,
      ContentType: filetype as string,
    })

    // URL is valid for 15 minutes
    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 15 * 60,
    })

    res.status(200).json({
      success: true,
      data: {
        uploadUrl,
        key: uniqueKey,
        expiresIn: 15 * 60,
      },
    } as ApiResponse<PresignedUrlResponse>)
  }
)

export default router