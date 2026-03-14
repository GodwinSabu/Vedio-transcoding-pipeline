import { Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import { AuthRequest, JwtPayload } from '../types'
import { env } from '../config/env'

export const protect = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let token: string | undefined

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1]
  }

  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Not authorized — no token provided',
    })
    return
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true },
    })

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User belonging to this token no longer exists',
      })
      return
    }

    req.user = user
    next()
  } catch {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    })
  }
}