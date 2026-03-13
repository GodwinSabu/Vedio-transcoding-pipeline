import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { protect } from '../middleware/auth'
import { AuthRequest, ApiResponse, AuthResponseData, MeResponseData } from '../types'
import { env } from '../config/env'

const router = Router()
const prisma = new PrismaClient()

// helper — generate JWT
const generateToken = (id: string, email: string): string => {
  return jwt.sign({ id, email }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  } as jwt.SignOptions)
}

// ─── POST /api/auth/register ───────────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body

  if (!email || !password) {
    res.status(400).json({
      success: false,
      message: 'Email and password are required',
    } as ApiResponse)
    return
  }

  if (password.length < 6) {
    res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters',
    } as ApiResponse)
    return
  }

  // check if user exists
  const existingUser = await prisma.user.findUnique({ where: { email } })

  if (existingUser) {
    res.status(400).json({
      success: false,
      message: 'Email already registered',
    } as ApiResponse)
    return
  }

  // hash password — never store plain text
  const hashedPassword = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: { email, password: hashedPassword },
    select: { id: true, email: true, createdAt: true },
  })

  const token = generateToken(user.id, user.email)

  res.status(201).json({
    success: true,
    message: 'Account created successfully',
    data: { token, user },
  } as ApiResponse<AuthResponseData>)
})

// ─── POST /api/auth/login ──────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body

  if (!email || !password) {
    res.status(400).json({
      success: false,
      message: 'Email and password are required',
    } as ApiResponse)
    return
  }

  // fetch user including password for comparison
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, password: true, createdAt: true },
  })

  if (!user) {
    res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    } as ApiResponse)
    return
  }

  const isPasswordValid = await bcrypt.compare(password, user.password)

  if (!isPasswordValid) {
    res.status(401).json({
      success: false,
      message: 'Invalid email or password',
    } as ApiResponse)
    return
  }

  const token = generateToken(user.id, user.email)

  res.status(200).json({
    success: true,
    message: 'Logged in successfully',
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      },
    },
  } as ApiResponse<AuthResponseData>)
})

// ─── GET /api/auth/me — protected ─────────────────────────────────
router.get('/me', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, createdAt: true },
  })

  res.status(200).json({
    success: true,
    data: { user },
  } as ApiResponse<MeResponseData>)
})

export default router