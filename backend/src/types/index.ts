import { Request } from 'express'

// extend Express Request to include authenticated user
export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
  }
}

// shape of JWT payload
export interface JwtPayload {
  id: string
  email: string
  iat?: number
  exp?: number
}

// standard API response shape — every endpoint returns this
export interface ApiResponse<T = null> {
  success: boolean
  message?: string
  data?: T
  error?: string
}

// auth response data shape
export interface AuthResponseData {
  token: string
  user: {
    id: string
    email: string
    createdAt: Date
  }
}

// /me endpoint response (user profile only, no token)
export interface MeResponseData {
  user: {
    id: string
    email: string
    createdAt: Date
  }
}