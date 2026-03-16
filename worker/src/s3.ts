import {
    S3Client,
    GetObjectCommand,
    PutObjectCommand,
  } from '@aws-sdk/client-s3'
  import { createWriteStream, createReadStream } from 'fs'
  import { pipeline } from 'stream/promises'
  import { Readable } from 'stream'
  import path from 'path'
  import fs from 'fs'
  
  export const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
  
  const BUCKET = process.env.S3_BUCKET_NAME!
  
  // download a file from S3 to local disk
  export const downloadFromS3 = async (
    s3Key: string,
    localPath: string
  ): Promise<void> => {
    console.log(`Downloading s3://${BUCKET}/${s3Key} → ${localPath}`)
  
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key })
    const response = await s3Client.send(command)
  
    if (!response.Body) {
      throw new Error('Empty response body from S3')
    }
  
    await pipeline(response.Body as Readable, createWriteStream(localPath))
    console.log(`Download complete: ${localPath}`)
  }
  
  // upload a local file to S3
  export const uploadToS3 = async (
    localPath: string,
    s3Key: string,
    contentType: string = 'video/mp4'
  ): Promise<number> => {
    console.log(`Uploading ${localPath} → s3://${BUCKET}/${s3Key}`)
  
    const fileStream = createReadStream(localPath)
    const stats = fs.statSync(localPath)
  
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: fileStream,
      ContentType: contentType,
      ContentLength: stats.size,
    })
  
    await s3Client.send(command)
    console.log(`Upload complete: ${s3Key} (${stats.size} bytes)`)
  
    return stats.size
  }