export interface User {
    id: string
    email: string
    createdAt: string
  }
  
  export interface AuthResponse {
    success: boolean
    message: string
    data: {
      token: string
      user: User
    }
  }
  
  export interface Output {
    id: string
    resolution: string
    s3Key: string
    fileSize: number | null
  }
  
  export interface Job {
    id: string
    bullJobId: string
    status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
    progress: number
    errorMsg: string | null
    startedAt: string | null
    completedAt: string | null
    createdAt: string
  }
  
  export interface Video {
    id: string
    title: string
    status: 'PENDING' | 'QUEUED' | 'PROCESSING' | 'DONE' | 'FAILED'
    originalKey: string
    fileSize: number | null
    duration: number | null
    webhookUrl: string | null
    userId: string
    outputs: Output[]
    jobs: Job[]
    createdAt: string
    updatedAt: string
  }
  
  export interface PaginatedVideos {
    videos: Video[]
    pagination: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
  
  export interface PresignedUrlResponse {
    uploadUrl: string
    key: string
    expiresIn: number
  }
  
  export interface QueueJobResponse {
    jobId: string
    bullJobId: string
    videoId: string
    status: string
    resolutions: string[]
    queuePosition: number
  }