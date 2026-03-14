import Bull from 'bull'
import { env } from './env'

// shape of data stored in each job
export interface TranscodeJobData {
  videoId: string
  userId: string
  originalKey: string
  resolutions: string[]
  webhookUrl?: string
}

// create the queue — Bull connects to Redis automatically
export const transcodeQueue = new Bull<TranscodeJobData>(
  'video-transcoding',
  {
    redis: env.redisUrl,
    defaultJobOptions: {
      attempts: 3,                    // retry 3 times if job fails
      backoff: {
        type: 'exponential',
        delay: 5000,                  // wait 5s, then 10s, then 20s between retries
      },
      removeOnComplete: 50,           // keep last 50 completed jobs in Redis
      removeOnFail: 100,              // keep last 100 failed jobs for debugging
    },
  }
)

// max concurrent jobs — leaky bucket pattern
export const MAX_CONCURRENT_JOBS = 5

// log queue events — helpful during development
transcodeQueue.on('error', (error) => {
  console.error('Queue error:', error)
})

transcodeQueue.on('waiting', (jobId) => {
  console.log(`Job ${jobId} is waiting`)
})

transcodeQueue.on('active', (job) => {
  console.log(`Job ${job.id} started processing videoId: ${job.data.videoId}`)
})

transcodeQueue.on('completed', (job) => {
  console.log(`Job ${job.id} completed for videoId: ${job.data.videoId}`)
})

transcodeQueue.on('failed', (job, error) => {
  console.error(`Job ${job.id} failed for videoId: ${job.data.videoId}:`, error.message)
})

export default transcodeQueue