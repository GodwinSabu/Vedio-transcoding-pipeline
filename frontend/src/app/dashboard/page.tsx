'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { videoApi } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import { Video, PaginatedVideos } from '@/types'
import { formatBytes, formatDate, statusColor } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import {
  Upload,
  Video as VideoIcon,
  LogOut,
  RefreshCw,
  Trash2,
  Eye,
} from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const { user, logout, loading: authLoading } = useAuth()
  const { toast } = useToast()

  const [data, setData] = useState<PaginatedVideos | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login')
    }
  }, [user, authLoading, router])

  const fetchVideos = async () => {
    setLoading(true)
    try {
      const res = await videoApi.list(page)
      setData(res.data.data)
    } catch {
      toast({ title: 'Error', description: 'Could not load videos', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) fetchVideos()
  }, [user, page])

  const handleDelete = async (videoId: string) => {
    if (!confirm('Delete this video?')) return
    setDeletingId(videoId)
    try {
      await videoApi.delete(videoId)
      toast({ title: 'Deleted', description: 'Video removed successfully' })
      fetchVideos()
    } catch {
      toast({ title: 'Error', description: 'Could not delete video', variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  if (authLoading) return null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navbar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <VideoIcon className="w-5 h-5 text-slate-700" />
            <span className="font-semibold text-slate-900">VideoTranscoder</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{user?.email}</span>
            <Separator orientation="vertical" className="h-5" />
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Your Videos</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {data?.pagination.total ?? 0} videos total
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchVideos} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Link href="/upload">
              <Button size="sm">
                <Upload className="w-4 h-4 mr-1" />
                Upload Video
              </Button>
            </Link>
          </div>
        </div>

        {/* Video list */}
        {loading ? (
          <div className="grid gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-white rounded-lg border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : !data?.videos.length ? (
          <Card>
            <CardContent className="py-16 text-center">
              <VideoIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 mb-4">No videos yet</p>
              <Link href="/upload">
                <Button>
                  <Upload className="w-4 h-4 mr-1" />
                  Upload your first video
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {data.videos.map((video: Video) => (
              <Card key={video.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: title + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-900 truncate">
                          {video.title}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(video.status)}`}
                        >
                          {video.status}
                        </span>
                      </div>
                      <div className="flex gap-3 text-xs text-slate-400">
                        <span>{formatBytes(video.fileSize)}</span>
                        <span>·</span>
                        <span>{formatDate(video.createdAt)}</span>
                        {video.outputs.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{video.outputs.length} outputs</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right: resolutions + actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {video.outputs.map((o) => (
                        <Badge key={o.id} variant="secondary" className="text-xs">
                          {o.resolution}
                        </Badge>
                      ))}
                      <Link href={`/video/${video.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(video.id)}
                        disabled={deletingId === video.id}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span className="text-sm text-slate-500">
              Page {page} of {data.pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === data.pagination.totalPages}
            >
              Next
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}