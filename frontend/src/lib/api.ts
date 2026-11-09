import axios from 'axios'
import {
  AuthResponse,
  PaginatedVideos,
  Video,
  PresignedUrlResponse,
  QueueJobResponse,
} from '@/types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'

// axios instance with base URL
const api = axios.create({ baseURL: BASE_URL })

// attach JWT token to every request automatically
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// if token expired, redirect to login
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ─── Auth ──────────────────────────────────────────────────────────
export const authApi = {
  register: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/register', { email, password }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),

  me: () => api.get('/auth/me'),
}

// ─── Upload ────────────────────────────────────────────────────────
export const uploadApi = {
  getPresignedUrl: (filename: string, filetype: string, filesize: number) =>
    api.get<{ success: boolean; data: PresignedUrlResponse }>(
      `/upload/presigned-url?filename=${encodeURIComponent(filename)}&filetype=${encodeURIComponent(filetype)}&filesize=${filesize}`
    ),

  // upload directly to S3 using the presigned URL
  uploadToS3: (uploadUrl: string, file: File, onProgress?: (percent: number) => void) =>
    axios.put(uploadUrl, file, {
      headers: { 'Content-Type': file.type },
      onUploadProgress: (e) => {
        if (e.total && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    }),
}

// ─── Videos ────────────────────────────────────────────────────────
export const videoApi = {
  create: (title: string, originalKey: string, fileSize: number) =>
    api.post<{ success: boolean; data: { video: Video } }>('/videos', {
      title,
      originalKey,
      fileSize,
    }),

  list: (page = 1, limit = 10) =>
    api.get<{ success: boolean; data: PaginatedVideos }>(
      `/videos?page=${page}&limit=${limit}`
    ),

  get: (id: string) =>
    api.get<{ success: boolean; data: { video: Video } }>(`/videos/${id}`),

  delete: (id: string) => api.delete(`/videos/${id}`),
}

// ─── Transcode ─────────────────────────────────────────────────────
export const transcodeApi = {
  start: (videoId: string, resolutions: string[]) =>
    api.post<{ success: boolean; data: QueueJobResponse }>(
      `/transcode/${videoId}`,
      { resolutions }
    ),
}

// ─── Jobs ──────────────────────────────────────────────────────────
export const jobApi = {
  get: (jobId: string) =>
    api.get<{ success: boolean; data: { job: Job; bullState: string; video: Video } }>(
      `/jobs/${jobId}`
    ),

  list: (page = 1) =>
    api.get(`/jobs?page=${page}`),

  queueStats: () =>
    api.get('/jobs/queue/stats'),
}

export default api