import { useEffect, useMemo, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { ArrowLeft, Check, Copy, DoorOpen, ExternalLink, LoaderCircle, LockKeyhole, Radio, Send, Wifi, WifiOff } from 'lucide-react'
import { AuthPage } from './components/AuthPage'
import { AboutPage } from './components/AboutPage'
import { ChatPanel } from './components/ChatPanel'
import { HistoryPage } from './components/HistoryPage'
import { LandingPage } from './components/LandingPage'
import { ParticipantsPanel } from './components/ParticipantsPanel'
import { ReactionBar } from './components/ReactionBar'
import { RequestQueue } from './components/RequestQueue'
import { YouTubePlayer } from './components/YouTubePlayer'
import { clearAuthToken, getStoredAuthToken, logOut, restoreSession, storeAuthToken } from './lib/auth'
import type { ApprovalRequest, AuthSession, Participant, Role, RoomReaction, RoomSnapshot } from './types'
import './styles.css'
import './room.css'

type Route = { roomId: string | null; mode: 'landing' | 'create' | 'join' | 'history' | 'about' }
type Toast = { id: number; message: string; tone: 'info' | 'success' | 'error' }
type AuthView = 'login' | 'signup' | null

function getInitialRoute(): Route {
  if (window.location.pathname === '/history') return { roomId: null, mode: 'history' }
  if (window.location.pathname === '/about') return { roomId: null, mode: 'about' }
  const match = window.location.pathname.match(/^\/room\/(.+)$/)
  if (!match) return { roomId: null, mode: 'landing' }
  if (match[1] === 'new') {
    return { roomId: null, mode: 'create' }
  }
  return {
    roomId: decodeURIComponent(match[1]),
    mode: 'join',
  }
}

function App() {
  const [route, setRoute] = useState<Route>(getInitialRoute)
  const [authSession, setAuthSession] = useState<AuthSession | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [authView, setAuthView] = useState<AuthView>(null)

  useEffect(() => {
    let active = true
    const token = getStoredAuthToken()

    if (!token) {
      setAuthChecking(false)
      return () => { active = false }
    }

    restoreSession(token)
      .then((user) => {
        if (!active) return
        sessionStorage.setItem('watchtower_username', user.name)
        setAuthSession({ user, token })
        setAuthChecking(false)
      })
      .catch(() => {
        if (!active) return
        clearAuthToken()
        setAuthSession(null)
        setAuthChecking(false)
      })

    return () => { active = false }
  }, [])

  function enterRoom(mode: 'create' | 'join', roomId: string | null) {
    const path = mode === 'create' ? '/room/new' : `/room/${encodeURIComponent(roomId || '')}`
    window.history.pushState({}, '', path)
    setRoute({ roomId, mode })
  }

  function leaveRoom() {
    window.history.pushState({}, '', '/')
    setRoute({ roomId: null, mode: 'landing' })
  }

  function openHistory() {
    if (!authSession) {
      setAuthView('login')
      return
    }
    window.history.pushState({}, '', '/history')
    setRoute({ roomId: null, mode: 'history' })
  }

  function openAbout() {
    window.history.pushState({}, '', '/about')
    setRoute({ roomId: null, mode: 'about' })
  }

  function completeAuthentication(session: AuthSession) {
    storeAuthToken(session.token)
    sessionStorage.setItem('watchtower_username', session.user.name)
    setAuthSession(session)
    setAuthView(null)
  }

  function closeAuth() {
    setAuthView(null)
  }

  function signOut() {
    const token = authSession?.token
    clearAuthToken()
    sessionStorage.removeItem('watchtower_username')
    window.history.pushState({}, '', '/')
    setRoute({ roomId: null, mode: 'landing' })
    setAuthSession(null)
    if (token) void logOut(token)
  }

  useEffect(() => {
    const onPopState = () => setRoute(getInitialRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  if (route.mode !== 'landing' && authChecking && getStoredAuthToken() && !authView) {
    return <div className="center-state"><div className="center-state-card loading-card"><LoaderCircle size={24} className="spin" /><span className="section-kicker">ACCOUNT CHECK</span><h1>Getting Watchtower ready.</h1><p>Checking your session before opening the room.</p></div></div>
  }

  if (authView) {
    return <AuthPage initialMode={authView} onAuthenticated={completeAuthentication} onBack={closeAuth} />
  }
  if (route.mode === 'landing') return <LandingPage onEnter={enterRoom} user={authSession?.user || null} onSignOut={signOut} onOpenAuth={setAuthView} onOpenHistory={openHistory} onOpenAbout={openAbout} />
  if (route.mode === 'history') return <HistoryPage user={authSession?.user || null} token={authSession?.token || null} onBack={leaveRoom} onOpenAuth={() => setAuthView('login')} />
  if (route.mode === 'about') return <AboutPage onBack={leaveRoom} />
  return <RoomPage mode={route.mode} initialRoomId={route.roomId} token={authSession?.token || null} onLeave={leaveRoom} />
}

interface RoomPageProps {
  mode: 'create' | 'join'
  initialRoomId: string | null
  token: string | null
  onLeave: () => void
}

function RoomPage({ mode, initialRoomId, token, onLeave }: RoomPageProps) {
  const socketRef = useRef<Socket | null>(null)
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [selfId, setSelfId] = useState('')
  const [videoInput, setVideoInput] = useState('')
  const [removed, setRemoved] = useState(false)
  const [roomError, setRoomError] = useState('')
  const [syncRevision, setSyncRevision] = useState(0)
  const [reactions, setReactions] = useState<RoomReaction[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const toastId = useRef(0)
  const reactionTimers = useRef<number[]>([])

  const me = useMemo(() => room?.participants.find((participant) => participant.id === selfId), [room?.participants, selfId])
  const host = useMemo(() => room?.participants.find((participant) => participant.id === room.hostId), [room?.hostId, room?.participants])
  const roomTitle = host ? `${host.username}'s Room` : 'Watch Room'
  const canControl = me?.role === 'host' || me?.role === 'moderator'
  const isHost = me?.role === 'host'
  const canReview = isHost || me?.role === 'moderator'
  const visibleRequests = useMemo(() => {
    if (!room) return []
    return canReview ? room.pendingRequests : room.pendingRequests.filter((request) => request.requestedBy === selfId)
  }, [canReview, room, selfId])

  function notify(message: string, tone: Toast['tone'] = 'info') {
    const id = ++toastId.current
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500)
  }

  useEffect(() => {
    document.title = room ? `${room.code} — Watchtower` : 'Joining room — Watchtower'
  }, [room])

  useEffect(() => {
    const socket = io({ auth: token ? { token } : {}, transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnection('connected')
      if (mode === 'create') socket.emit('create_room')
      else socket.emit('join_room', { roomId: initialRoomId })
    })
    socket.on('disconnect', () => setConnection('disconnected'))
    socket.on('connect_error', () => setConnection('disconnected'))
    socket.on('room_created', ({ code }: { code: string }) => notify(`Room ${code} is ready to share.`, 'success'))
    socket.on('room_joined', (snapshot: RoomSnapshot) => {
      setRoom(snapshot)
      setSelfId(snapshot.selfId || '')
      setVideoInput(`https://youtu.be/${snapshot.state.videoId}`)
      setReactions([])
      setRoomError('')
    })
    socket.on('sync_state', ({ state, action }: { state: RoomSnapshot['state']; action?: string }) => {
      setRoom((current) => current ? { ...current, state } : current)
      if (action === 'sync') {
        setSyncRevision((current) => current + 1)
        notify('Synced to the room timeline.', 'success')
      }
    })
    socket.on('participants_update', ({ participants, hostId }: { participants: Participant[]; hostId: string }) => {
      setRoom((current) => current ? { ...current, participants, hostId } : current)
    })
    socket.on('user_joined', ({ participant, participants, hostId }: { participant: Participant; participants: Participant[]; hostId: string }) => {
      setRoom((current) => current ? { ...current, participants, hostId } : current)
      notify(`${participant.username} joined the room.`, 'info')
    })
    socket.on('user_left', ({ username: leftUsername, participants, hostId }: { username: string; participants: Participant[]; hostId: string }) => {
      setRoom((current) => current ? { ...current, participants, hostId } : current)
      notify(`${leftUsername} left the room.`, 'info')
    })
    socket.on('role_assigned', ({ participants, hostId, username: changedUsername, role }: { participants: Participant[]; hostId: string; username: string; role: Role }) => {
      setRoom((current) => current ? { ...current, participants, hostId } : current)
      notify(`${changedUsername} is now ${role}.`, 'success')
    })
    socket.on('host_transferred', ({ participants, hostId, newHostId }: { participants: Participant[]; hostId: string; newHostId: string }) => {
      setRoom((current) => current ? { ...current, participants, hostId } : current)
      notify(newHostId === selfId ? 'You are now the host.' : 'Host role transferred.', 'success')
    })
    socket.on('participant_removed', ({ userId, participants, hostId, reason }: { userId: string; participants?: Participant[]; hostId?: string; reason?: string }) => {
      if (userId === selfId && !participants) {
        setRemoved(true)
        notify(reason || 'You were removed from the room.', 'error')
        return
      }
      if (participants) setRoom((current) => current ? { ...current, participants, hostId: hostId || current.hostId } : current)
    })
    socket.on('approval_request', (request: ApprovalRequest) => {
      setRoom((current) => {
        if (!current || current.pendingRequests.some((item) => item.id === request.id)) return current
        return { ...current, pendingRequests: [...current.pendingRequests, request] }
      })
      if (request.requestedBy !== selfId) notify(`${request.username} requested ${request.type.replace('_', ' ')}.`, 'info')
    })
    socket.on('request_resolved', (request: ApprovalRequest) => {
      setRoom((current) => current ? { ...current, pendingRequests: current.pendingRequests.filter((item) => item.id !== request.id) } : current)
      if (request.requestedBy === selfId) notify(request.status === 'approved' ? 'Your request was approved.' : 'Your request was declined.', request.status === 'approved' ? 'success' : 'error')
    })
    socket.on('request_submitted', (request: ApprovalRequest) => {
      setRoom((current) => {
        if (!current || current.pendingRequests.some((item) => item.id === request.id)) return current
        return { ...current, pendingRequests: [...current.pendingRequests, request] }
      })
      notify('Request sent to the room.', 'success')
    })
    socket.on('chat_message', (message: RoomSnapshot['messages'][number]) => {
      setRoom((current) => current ? { ...current, messages: [...current.messages, message].slice(-100) } : current)
    })
    socket.on('reaction', (reaction: RoomReaction) => {
      setReactions((current) => [...current, reaction].slice(-8))
      const timer = window.setTimeout(() => {
        setReactions((current) => current.filter((item) => item.id !== reaction.id))
        reactionTimers.current = reactionTimers.current.filter((item) => item !== timer)
      }, 2400)
      reactionTimers.current.push(timer)
    })
    socket.on('action_rejected', ({ message }: { message: string }) => notify(message, 'error'))
    socket.on('server_error', ({ message, code }: { message: string; code: string }) => {
      if (code === 'ROOM_NOT_FOUND') setRoomError(message)
      else notify(message, 'error')
    })

    return () => {
      reactionTimers.current.forEach((timer) => window.clearTimeout(timer))
      reactionTimers.current = []
      socket.disconnect()
      socketRef.current = null
    }
  }, [initialRoomId, mode, token])

  function emit(event: string, payload?: Record<string, unknown>) {
    socketRef.current?.emit(event, payload)
  }

  function copyInvite() {
    if (!room) return
    const link = `${window.location.origin}/room/${room.code}`
    navigator.clipboard?.writeText(link)
    notify('Invite link copied to clipboard.', 'success')
  }

  function sendAction(action: 'play' | 'pause' | 'seek' | 'change_video', payload: Record<string, unknown>) {
    if (canControl) emit(action, payload)
    else emit('request_action', { type: action, payload })
  }

  function handleChangeVideo() {
    if (!videoInput.trim()) return notify('Paste a YouTube link first.', 'error')
    sendAction('change_video', { url: videoInput.trim() })
  }

  function requestPlay() {
    emit('request_action', { type: 'play', payload: { currentTime: room?.state.currentTime || 0 } })
  }

  function sendReaction(emoji: string) {
    emit('reaction', { emoji })
  }

  function leave() {
    emit('leave_room')
    onLeave()
  }

  if (removed) {
    return <div className="center-state"><div className="center-state-card"><span className="center-state-icon"><DoorOpen size={22} /></span><span className="section-kicker">ROOM ACCESS</span><h1>You’ve been shown the door.</h1><p>The host removed you from this watch room. You can start a fresh room or join another invite.</p><button className="primary-button" onClick={onLeave}><ArrowLeft size={16} /> Back to home</button></div></div>
  }

  if (roomError) {
    return <div className="center-state"><div className="center-state-card"><span className="center-state-icon error"><WifiOff size={22} /></span><span className="section-kicker">ROOM NOT FOUND</span><h1>That room has moved on.</h1><p>{roomError}</p><button className="primary-button" onClick={onLeave}><ArrowLeft size={16} /> Back to home</button></div></div>
  }

  if (!room) {
    return <div className="center-state"><div className="center-state-card loading-card"><LoaderCircle size={24} className="spin" /><span className="section-kicker">{connection === 'disconnected' ? 'RECONNECTING' : 'JOINING ROOM'}</span><h1>Finding your people.</h1><p>Opening a secure room and syncing the first frame…</p><button className="ghost-button" onClick={onLeave}>Cancel</button></div></div>
  }

  return (
    <div className="app-shell room-page">
      <header className="room-header">
        <div className="room-header-inner container-wide">
          <button className="room-brand" onClick={leave}><span className="brand-mark small" aria-hidden="true"><img src="/watchtower-mark.png" alt="" /></span><span className="brand-name">watchtower</span></button>
          <div className="room-header-divider" />
          <div className="room-id"><span>ROOM</span><strong>{room.code}</strong><button onClick={copyInvite} title="Copy invite link"><Copy size={14} /></button></div>
          <div className="header-spacer" />
          <div className={`connection-pill ${connection}`}><span className="connection-dot" />{connection === 'connected' ? 'LIVE SYNC' : connection.toUpperCase()}</div>
          <div className={`my-role role-pill role-${me?.role || 'participant'}`}><span>{me?.role === 'host' ? 'Host' : me?.role === 'moderator' ? 'Moderator' : 'Participant'}</span></div>
          <button className="leave-button" onClick={leave}><DoorOpen size={15} /> Leave</button>
        </div>
      </header>

      <main className="room-main container-wide">
        <section className="room-heading-row room-intro">
          <div><div className="room-intro-label"><span className="eyebrow-dot" /> WATCH ROOM · {room.code}</div><h1>{roomTitle}</h1><p>A shared screen for the people who want to experience the same moment at the same time.</p></div>
          <div className="room-heading-status"><span className="status-orb"><Radio size={16} /></span><div><strong>{room.state.playing ? 'Watching together' : 'Paused together'}</strong><span>{room.participants.length} {room.participants.length === 1 ? 'person' : 'people'} in the room</span></div></div>
        </section>

        <div className="room-grid room-workspace">
          <section className="watch-column">
            <div className="video-card cinema-card">
              <div className="video-card-heading cinema-card-heading"><div><span className="section-kicker">SHARED SCREEN</span><h2>{room.state.playing ? 'Now playing for everyone' : 'Ready when the room is'}</h2></div><span className="sync-badge"><Wifi size={14} /> Live sync</span></div>
              <YouTubePlayer state={room.state} canControl={Boolean(canControl)} onPlay={(currentTime) => sendAction('play', { currentTime })} onPause={(currentTime) => sendAction('pause', { currentTime })} onSeek={(time) => sendAction('seek', { time })} onSyncNow={() => emit('sync_now')} onProgress={(currentTime) => emit('playback_progress', { currentTime })} syncRevision={syncRevision} reactions={reactions} />
              <ReactionBar onReact={sendReaction} />
              <div className="video-source-row"><div className="video-source-label"><span className="source-icon"><ExternalLink size={14} /></span><div><span>VIDEO SOURCE</span><strong>youtube.com</strong></div></div><div className="change-video-control"><input aria-label="YouTube URL" value={videoInput} onChange={(event) => setVideoInput(event.target.value)} placeholder="Paste a YouTube URL" /><button onClick={handleChangeVideo} title={canControl ? 'Change video' : 'Request a video change'}>{canControl ? 'Change video' : 'Request change'}</button></div></div>
            </div>
            <div className="watch-column-support">
              <RequestQueue requests={visibleRequests} canReview={Boolean(canReview)} onResolve={(requestId, approved) => emit('resolve_request', { requestId, approved })} />
              {!canControl && <div className="permission-callout"><div className="permission-icon"><LockKeyhole size={16} /></div><div><strong>You’re in viewer mode.</strong><span>Playback follows the room. Need to make a change?</span></div><button className="ghost-button compact" onClick={requestPlay}><Send size={14} /> Request play</button></div>}
              <div className="room-note"><span className="note-star">✦</span><div><strong>Built for the shared moment.</strong><span>React freely. Hosts and moderators keep the timeline smooth.</span></div></div>
            </div>
          </section>
          <aside className="room-sidebar">
            <ChatPanel messages={room.messages} selfId={selfId} onSend={(text) => emit('chat_message', { text })} />
            <ParticipantsPanel participants={room.participants} selfId={selfId} isHost={Boolean(isHost)} onAssignRole={(userId, role) => emit('assign_role', { userId, role })} onRemove={(userId) => { if (window.confirm('Remove this participant from the room?')) emit('remove_participant', { userId }) }} onTransferHost={(userId) => emit('transfer_host', { userId })} />
          </aside>
        </div>
      </main>
      <ToastStack toasts={toasts} />
    </div>
  )
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return <div className="toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`toast ${toast.tone}`} key={toast.id}><span>{toast.tone === 'success' ? <Check size={15} /> : toast.tone === 'error' ? <WifiOff size={15} /> : <Radio size={15} />}</span>{toast.message}</div>)}</div>
}

export default App
