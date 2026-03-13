const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_EXPIRES_IN',
    'PORT',
  ] as const
  
  export const validateEnv = (): void => {
    const missing: string[] = []
  
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        missing.push(envVar)
      }
    }
  
    if (missing.length > 0) {
      console.error(`Missing required environment variables: ${missing.join(', ')}`)
      process.exit(1)
    }
  
    console.log('All environment variables validated')
  }
  
  export const env = {
    port: parseInt(process.env.PORT || '5000'),
    databaseUrl: process.env.DATABASE_URL as string,
    jwtSecret: process.env.JWT_SECRET as string,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN as string,
    nodeEnv: process.env.NODE_ENV || 'development',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  } as const