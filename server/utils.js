const YOUTUBE_PATTERNS = [
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
]

export function extractYouTubeId(value) {
  const input = String(value ?? '').trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input
  for (const pattern of YOUTUBE_PATTERNS) {
    const match = input.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function safeNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}
