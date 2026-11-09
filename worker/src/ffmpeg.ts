import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execFileAsync = promisify(execFile)

// resolution config — width x height and bitrate
const RESOLUTION_CONFIG: Record<
  string,
  { scale: string; videoBitrate: string; audioBitrate: string }
> = {
  '360p': { scale: 'scale=-2:360', videoBitrate: '800k',  audioBitrate: '96k'  },
  '480p': { scale: 'scale=-2:480', videoBitrate: '1400k', audioBitrate: '128k' },
  '720p': { scale: 'scale=-2:720', videoBitrate: '2800k', audioBitrate: '128k' },
  '1080p':{ scale: 'scale=-2:1080',videoBitrate: '5000k', audioBitrate: '192k' },
}

export interface TranscodeResult {
  resolution: string
  outputPath: string
}

// transcode a single resolution
export const transcodeResolution = async (
  inputPath: string,
  outputDir: string,
  resolution: string,
  onProgress?: (percent: number) => void
): Promise<TranscodeResult> => {
  const config = RESOLUTION_CONFIG[resolution]

  if (!config) {
    throw new Error(`Unknown resolution: ${resolution}`)
  }

  const outputPath = path.join(outputDir, `${resolution}.mp4`)

  console.log(`Transcoding ${resolution}...`)

  // get video duration first for progress calculation
  let duration = 0
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      inputPath,
    ])
    const info = JSON.parse(stdout)
    duration = parseFloat(info.format?.duration || '0')
  } catch {
    console.warn('Could not get video duration — progress will be unavailable')
  }

  await new Promise<void>((resolve, reject) => {
    const args = [
      '-i', inputPath,
      '-vf', config.scale,
      '-c:v', 'libx264',
      '-preset', 'fast',          // balance between speed and compression
      '-crf', '23',               // quality — lower = better quality, larger file
      '-b:v', config.videoBitrate,
      '-c:a', 'aac',
      '-b:a', config.audioBitrate,
      '-movflags', '+faststart',  // puts metadata at start — better for streaming
      '-y',                       // overwrite output if exists
      outputPath,
    ]

    const ffmpeg = require('child_process').spawn('ffmpeg', args)

    let stderrBuffer = ''

    // FFmpeg writes progress to stderr
    ffmpeg.stderr.on('data', (data: Buffer) => {
      const line = data.toString()
      stderrBuffer += line

      // parse time= from FFmpeg output for progress
      if (duration > 0 && onProgress) {
        const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/)
        if (timeMatch) {
          const hours = parseInt(timeMatch[1])
          const minutes = parseInt(timeMatch[2])
          const seconds = parseFloat(timeMatch[3])
          const currentTime = hours * 3600 + minutes * 60 + seconds
          const percent = Math.min(Math.round((currentTime / duration) * 100), 99)
          onProgress(percent)
        }
      }
    })

    ffmpeg.on('close', (code: number) => {
      if (code === 0) {
        console.log(`${resolution} transcoding complete`)
        resolve()
      } else {
        reject(new Error(`FFmpeg exited with code ${code}\n${stderrBuffer.slice(-500)}`))
      }
    })

    ffmpeg.on('error', (err: Error) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}. Is FFmpeg installed?`))
    })
  })

  return { resolution, outputPath }
}

// transcode all resolutions sequentially
export const transcodeAll = async (
  inputPath: string,
  outputDir: string,
  resolutions: string[],
  onProgress?: (resolution: string, percent: number) => void
): Promise<TranscodeResult[]> => {
  // make sure output dir exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const results: TranscodeResult[] = []

  for (const resolution of resolutions) {
    const result = await transcodeResolution(
      inputPath,
      outputDir,
      resolution,
      (percent) => onProgress?.(resolution, percent)
    )
    results.push(result)
  }

  return results
}