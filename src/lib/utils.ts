import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function parseTimeInput(input: string): number | null {
  // Accepts "12:34" or "12.34" or "754" (seconds)
  if (!input.trim()) return null
  if (input.includes(':')) {
    const [m, s] = input.split(':').map(Number)
    if (isNaN(m) || isNaN(s)) return null
    return m * 60 + s
  }
  const num = parseFloat(input)
  return isNaN(num) ? null : Math.round(num)
}

export function getYouTubeEmbedUrl(url: string | null): string | null {
  if (!url) return null
  // Support youtube.com/watch?v=, youtu.be/, youtube.com/embed/
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return `https://www.youtube.com/embed/${match[1]}`
  }
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  return null
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
