import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Check, ChevronLeft, ChevronRight, LoaderCircle, Pause, Play, RefreshCw, Volume2 } from 'lucide-react'
import type { PlaybackState, RoomReaction } from '../types'

declare global {
  interface Window {
    YT?: {
      Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayerApi
      PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; CUED: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

interface YouTubePlayerApi {
  destroy: () => void
  cueVideoById: (videoId: string, startSeconds?: number) => void
  loadVideoById: (videoId: string, startSeconds?: number) => void
  playVideo: () => void
  pauseVideo: () => void
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void
  getCurrentTime: () => number
  getDuration: () => number
}

interface YouTubePlayerProps {
  state: PlaybackState
  canControl: boolean
  onPlay: (currentTime: number) => void
  onPause: (currentTime: number) => void
  onSeek: (time: number) => void
  onSyncNow: () => void
  onProgress: (currentTime: number) => void
  syncRevision: number
  reactions: RoomReaction[]
}

let apiPromise: Promise<void> | null = null

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise

  apiPromise = new Promise<void>((resolve) => {
    const previousCallback = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.()
      resolve()
    }
    const existingScript = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
    if (!existingScript) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      document.body.appendChild(script)
    }
  })
  return apiPromise
}

function formatTime(value: number) {
  const total = Math.max(0, Math.floor(value))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function reactionPosition(id: string) {
  const seed = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0)
  return 16 + (seed % 66)
}

export function YouTubePlayer({ state, canControl, onPlay, onPause, onSeek, onSyncNow, onProgress, syncRevision, reactions }: YouTubePlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YouTubePlayerApi | null>(null)
  const [ready, setReady] = useState(false)
  const [time, setTime] = useState(state.currentTime)
  const [duration, setDuration] = useState(0)
  const [failed, setFailed] = useState(false)
  const lastAppliedRef = useRef('')
  const lastSyncRevisionRef = useRef(syncRevision)
  const lastProgressReportRef = useRef(0)
  const playerVideoIdRef = useRef(state.videoId)

  useEffect(() => {
    let active = true
    loadYouTubeApi()
      .then(() => {
        if (!active || !mountRef.current || !window.YT?.Player) return
        const player = new window.YT.Player(mountRef.current, {
          width: '100%',
          height: '100%',
          videoId: state.videoId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              if (!active) return
              playerRef.current = player
              setReady(true)
              setDuration(player.getDuration() || 0)
              setTime(player.getCurrentTime() || state.currentTime)
            },
            onError: () => setFailed(true),
          },
        })
        playerRef.current = player
      })
      .catch(() => setFailed(true))

    return () => {
      active = false
      playerRef.current?.destroy()
      playerRef.current = null
    }
    // The player instance should be created once for the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const player = playerRef.current
    if (!player || !ready) return
    const predictedTime = state.currentTime + (state.playing ? Math.max(0, (Date.now() - state.updatedAt) / 1000) : 0)
    const forceSync = syncRevision !== lastSyncRevisionRef.current
    const stateKey = `${state.videoId}:${state.playing}:${state.updatedAt}:${syncRevision}`
    if (lastAppliedRef.current === stateKey) return
    lastAppliedRef.current = stateKey
    lastSyncRevisionRef.current = syncRevision
    if (state.videoId !== playerVideoIdRef.current) {
      playerVideoIdRef.current = state.videoId
      player.loadVideoById(state.videoId, predictedTime)
    } else if (forceSync || Math.abs((player.getCurrentTime?.() || 0) - predictedTime) > 1.6) {
      player.seekTo(predictedTime, true)
    }
    if (state.playing) player.playVideo()
    else player.pauseVideo()
    setTime(predictedTime)
  }, [ready, state.videoId, state.playing, state.currentTime, state.updatedAt, syncRevision])

  useEffect(() => {
    if (!ready || !playerRef.current) return
    const interval = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return
      const currentTime = player.getCurrentTime() || 0
      setTime(currentTime)
      setDuration(player.getDuration() || 0)
      if (canControl && state.playing && Date.now() - lastProgressReportRef.current >= 3000) {
        lastProgressReportRef.current = Date.now()
        onProgress(currentTime)
      }
    }, 400)
    return () => window.clearInterval(interval)
  }, [ready, canControl, state.playing, onProgress])

  const percentage = duration > 0 ? Math.min(100, (time / duration) * 100) : 0

  function moveBy(delta: number) {
    if (!canControl) return
    const next = Math.max(0, Math.min(duration || Number.MAX_SAFE_INTEGER, time + delta))
    playerRef.current?.seekTo(next, true)
    setTime(next)
    onSeek(next)
  }

  function handleToggle() {
    if (!canControl) return
    if (state.playing) {
      playerRef.current?.pauseVideo()
      onPause(time)
    } else {
      playerRef.current?.playVideo()
      onPlay(time)
    }
  }

  return (
    <div className="video-shell">
      <div className="video-frame">
        <div className="youtube-mount" ref={mountRef} />
        {!ready && !failed && (
          <div className="video-overlay loading-overlay">
            <LoaderCircle size={24} className="spin" />
            <span>Loading the shared screen…</span>
          </div>
        )}
        {failed && (
          <div className="video-overlay error-overlay">
            <span className="error-orb">!</span>
            <strong>That video could not be loaded.</strong>
            <button className="ghost-button compact" onClick={onSyncNow}>Try to sync again</button>
          </div>
        )}
        {ready && !state.playing && time === 0 && (
          <div className="video-watermark">
            <span className="watermark-mark">W</span>
            <span>Watchtower room</span>
          </div>
        )}
        <div className="reaction-overlay" aria-hidden="true">
          {reactions.map((reaction, index) => {
            const style = {
              '--reaction-x': `${reactionPosition(reaction.id)}%`,
              '--reaction-delay': `${Math.min(index * 65, 260)}ms`,
            } as CSSProperties
            return <span className="reaction-float" key={reaction.id} style={style}><span className="reaction-float-emoji">{reaction.emoji}</span><span className="reaction-float-name">{reaction.username}</span></span>
          })}
        </div>
      </div>
      <div className="player-controls">
        <div className="timeline-row">
          <span className="time-label">{formatTime(time)}</span>
          <div className="range-wrap">
            <div className="range-progress" style={{ width: `${percentage}%` }} />
            <input
              aria-label="Video position"
              className="timeline-input"
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={Math.min(time, duration || 1)}
              disabled={!canControl || !ready}
              onChange={(event) => {
                const next = Number(event.target.value)
                setTime(next)
                playerRef.current?.seekTo(next, true)
              }}
              onMouseUp={(event) => onSeek(Number((event.target as HTMLInputElement).value))}
              onTouchEnd={(event) => onSeek(Number((event.target as HTMLInputElement).value))}
            />
          </div>
          <span className="time-label">{formatTime(duration)}</span>
        </div>
        <div className="control-row">
          <div className="control-cluster">
            <button className="icon-button" aria-label="Back 10 seconds" disabled={!canControl} onClick={() => moveBy(-10)}><ChevronLeft size={18} /><span>10</span></button>
            <button className="play-button" aria-label={state.playing ? 'Pause video' : 'Play video'} disabled={!canControl || !ready} onClick={handleToggle}>
              {state.playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <button className="icon-button" aria-label="Forward 10 seconds" disabled={!canControl} onClick={() => moveBy(10)}><span>10</span><ChevronRight size={18} /></button>
          </div>
          <div className="control-status">
            {canControl ? <><Volume2 size={14} /> Your controls are live</> : <><Check size={14} /> Following the room host</>}
            <button className="sync-button" onClick={onSyncNow}><RefreshCw size={13} /> Sync now</button>
          </div>
        </div>
      </div>
    </div>
  )
}
