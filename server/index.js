import path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { Server } from 'socket.io'
import { nanoid } from 'nanoid'
import { AuthStore } from './authStore.js'
import { createDatabasePool, initialiseDatabase, verifyDatabase } from './database.js'
import { RoomManager } from './roomManager.js'
import { CONTROL_ROLES, ROLES } from './room.js'
import { extractYouTubeId, safeNumber } from './utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectEnvPath = path.resolve(__dirname, '../.env')
const serverEnvPath = path.resolve(__dirname, '.env')
dotenv.config({ path: projectEnvPath })
if (!process.env.DATABASE_URL) dotenv.config({ path: serverEnvPath })
if (!process.env.DATABASE_URL) {
  console.warn(`DATABASE_URL was not found. Add it to ${projectEnvPath} (recommended) or ${serverEnvPath}.`)
}
const clientDist = path.resolve(__dirname, '../client/dist')
const port = Number(process.env.PORT || 4000)
const clientOrigin = process.env.CLIENT_ORIGIN || true
const REACTION_EMOJIS = new Set(['👏', '😂', '😮', '❤️', '🔥'])
const REACTION_COOLDOWN_MS = 450

const app = express()
app.use(cors({ origin: clientOrigin, credentials: true }))
app.use(express.json())

const roomManager = new RoomManager()
const databasePool = createDatabasePool()
const authStore = new AuthStore(databasePool)

app.get('/health', async (_request, response) => {
  try {
    const accounts = await authStore.count()
    response.json({ ok: true, service: 'watchtower', database: 'connected', rooms: roomManager.count(), accounts })
  } catch (error) {
    console.error('Health check could not query PostgreSQL:', error)
    response.status(503).json({ ok: false, service: 'watchtower', database: 'unavailable' })
  }
})

function getBearerToken(request) {
  const authorization = request.get('authorization') || ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

function sendAuthDatabaseError(response, error) {
  console.error('Authentication database error:', error)
  return response.status(500).json({
    code: 'AUTH_DATABASE_ERROR',
    message: 'The account service is temporarily unavailable. Please try again shortly.',
  })
}

app.post('/api/auth/signup', async (request, response) => {
  try {
    const result = await authStore.register(request.body)
    if (result.error) return response.status(result.error.code === 'EMAIL_TAKEN' ? 409 : 400).json(result.error)
    const token = await authStore.createSession(result.user.id)
    if (!token) throw new Error('Could not create the account session.')
    return response.status(201).json({ user: result.user, token })
  } catch (error) {
    return sendAuthDatabaseError(response, error)
  }
})

app.post('/api/auth/login', async (request, response) => {
  try {
    const user = await authStore.authenticate(request.body)
    if (!user) return response.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Incorrect email ID or password.' })
    const token = await authStore.createSession(user.id)
    if (!token) throw new Error('Could not create the account session.')
    return response.json({ user, token })
  } catch (error) {
    return sendAuthDatabaseError(response, error)
  }
})

app.get('/api/auth/session', async (request, response) => {
  try {
    const user = await authStore.getSession(getBearerToken(request))
    if (!user) return response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Please log in to continue.' })
    return response.json({ user })
  } catch (error) {
    return sendAuthDatabaseError(response, error)
  }
})

app.get('/api/account/room-history', async (request, response) => {
  try {
    const user = await authStore.getSession(getBearerToken(request))
    if (!user) return response.status(401).json({ code: 'UNAUTHENTICATED', message: 'Please log in to view your room history.' })
    const history = await authStore.getRoomHistory(user.id)
    return response.json({ history })
  } catch (error) {
    return sendAuthDatabaseError(response, error)
  }
})

app.post('/api/auth/logout', async (request, response) => {
  try {
    await authStore.revokeSession(getBearerToken(request))
    return response.status(204).end()
  } catch (error) {
    return sendAuthDatabaseError(response, error)
  }
})

app.get('/api/rooms/:roomId', (request, response) => {
  const room = roomManager.getRoom(request.params.roomId)
  if (!room) return response.status(404).json({ error: 'Room not found' })
  return response.json({ id: room.id, code: room.code, participants: room.participantsSnapshot(), state: room.state })
})

const server = http.createServer(app)
const io = new Server(server, {
  cors: { origin: clientOrigin, credentials: true },
  transports: ['websocket', 'polling'],
})

io.use(async (socket, next) => {
  try {
    const token = typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : ''
    socket.data.authUser = await authStore.getSession(token)
    return next()
  } catch (error) {
    console.error('Socket authentication lookup failed:', error)
    return next(new Error('Authentication service is temporarily unavailable.'))
  }
})

function participantPayload(room) {
  return { participants: room.participantsSnapshot(), hostId: room.hostId }
}

function emitParticipants(room, event = 'participants_update') {
  io.to(room.id).emit(event, participantPayload(room))
}

function sendError(socket, message, code = 'BAD_REQUEST') {
  socket.emit('server_error', { message, code })
}

function emitSync(room, sourceUserId, action) {
  io.to(room.id).emit('sync_state', {
    state: room.state,
    sourceUserId,
    action,
    emittedAt: Date.now(),
  })
}

function getSession(socket) {
  if (!socket.data.roomId || !socket.data.userId) return null
  const room = roomManager.getRoom(socket.data.roomId)
  if (!room || !room.hasParticipant(socket.data.userId)) return null
  return { room, userId: socket.data.userId, participant: room.getParticipant(socket.data.userId) }
}

function applyAction(room, userId, action, payload = {}) {
  room.lastControllerId = userId
  switch (action) {
    case 'play':
      room.setPlayback(true, safeNumber(payload.currentTime, room.state.currentTime))
      break
    case 'pause':
      room.setPlayback(false, safeNumber(payload.currentTime, room.state.currentTime))
      break
    case 'seek':
      room.seek(safeNumber(payload.time, room.state.currentTime))
      break
    case 'change_video': {
      const videoId = extractYouTubeId(payload.videoId || payload.url)
      if (!videoId) return { error: 'Paste a valid YouTube URL or 11-character video ID.' }
      room.changeVideo(videoId)
      break
    }
    default:
      return { error: 'Unsupported playback action.' }
  }
  emitSync(room, userId, action)
  return { state: room.state }
}

function leaveSession(socket, { announce = true } = {}) {
  const session = getSession(socket)
  if (!session) return
  const { room, userId, participant } = session
  const nextParticipant = room.isHost(userId)
    ? room.participantsSnapshot().find((item) => item.id !== userId)
    : null
  const transfer = nextParticipant ? room.transferHost(nextParticipant.id) : null

  socket.leave(room.id)
  room.removeParticipant(userId)
  socket.data.roomId = null
  socket.data.userId = null

  if (announce) {
    io.to(room.id).emit('user_left', {
      userId,
      username: participant.username,
      ...participantPayload(room),
    })
  }

  if (transfer) {
    io.to(room.id).emit('host_transferred', {
      newHostId: transfer.nextHost.id,
      previousHostId: userId,
      reason: 'Host left the room',
      ...participantPayload(room),
    })
  }

  roomManager.removeIfEmpty(room.id)
}

function recordRoomVisit(socket, room, activity) {
  const user = socket.data.authUser
  if (!user) return

  void authStore.recordRoomHistory({
    userId: user.id,
    roomId: room.id,
    roomCode: room.code,
    activity,
  }).catch((error) => {
    console.error('Could not record room history:', error)
  })
}

io.on('connection', (socket) => {
  socket.on('create_room', () => {
    leaveSession(socket, { announce: false })
    const room = roomManager.createRoom({ username: socket.data.authUser?.name || 'Guest', socketId: socket.id })
    const host = room.participantsSnapshot()[0]
    socket.join(room.id)
    socket.data.roomId = room.id
    socket.data.userId = host.id
    recordRoomVisit(socket, room, 'created')
    socket.emit('room_created', { roomId: room.id, code: room.code })
    socket.emit('room_joined', { ...room.snapshot(), selfId: host.id })
  })

  socket.on('join_room', ({ roomId } = {}) => {
    leaveSession(socket, { announce: false })
    const room = roomManager.getRoom(roomId)
    if (!room) return sendError(socket, 'That room does not exist or has already closed.', 'ROOM_NOT_FOUND')
    if (room.participants.size >= 50) return sendError(socket, 'This room is full right now.', 'ROOM_FULL')

    const userId = `user_${socket.id.slice(-8)}_${Date.now().toString(36)}`
    const participant = room.addParticipant({
      id: userId,
      username: socket.data.authUser?.name || 'Guest',
      role: ROLES.PARTICIPANT,
      socketId: socket.id,
    })
    socket.join(room.id)
    socket.data.roomId = room.id
    socket.data.userId = userId
    recordRoomVisit(socket, room, 'joined')
    socket.emit('room_joined', { ...room.snapshot(), selfId: userId })
    socket.to(room.id).emit('user_joined', { participant: participant.toJSON(), ...participantPayload(room) })
  })

  socket.on('leave_room', () => leaveSession(socket))

  socket.on('sync_now', () => {
    const session = getSession(socket)
    if (!session) return sendError(socket, 'Join a room before syncing.', 'NOT_IN_ROOM')
    socket.emit('sync_state', { state: session.room.state, sourceUserId: null, action: 'sync' })
  })

  socket.on('playback_progress', ({ currentTime } = {}) => {
    const session = getSession(socket)
    if (!session || !session.room.state.playing) return

    // The host is the preferred source of truth. A moderator may report progress only
    // after they performed the most recent playback action.
    const mayReportProgress = session.room.isHost(session.userId) || session.room.lastControllerId === session.userId
    if (!mayReportProgress) return

    session.room.refreshPlaybackTime(safeNumber(currentTime, session.room.state.currentTime))
  })

  for (const action of ['play', 'pause', 'seek', 'change_video']) {
    socket.on(action, (payload = {}) => {
      const session = getSession(socket)
      if (!session) return sendError(socket, 'Join a room before controlling playback.', 'NOT_IN_ROOM')
      if (!session.room.canControl(session.userId)) {
        socket.emit('action_rejected', {
          action,
          message: 'Only the host or a moderator can control playback. Send a request for approval instead.',
          canRequest: true,
        })
        return
      }
      const result = applyAction(session.room, session.userId, action, payload)
      if (result.error) sendError(socket, result.error, 'INVALID_ACTION')
    })
  }

  socket.on('request_action', ({ type, payload } = {}) => {
    const session = getSession(socket)
    if (!session) return sendError(socket, 'Join a room before requesting an action.', 'NOT_IN_ROOM')
    if (session.room.canControl(session.userId)) return sendError(socket, 'You already have playback control.', 'ALREADY_ALLOWED')
    if (!['play', 'pause', 'seek', 'change_video'].includes(type)) return sendError(socket, 'That request type is not supported.', 'INVALID_REQUEST')
    const request = session.room.addRequest({ requestedBy: session.userId, type, payload })
    io.to(session.room.id).emit('approval_request', request)
    socket.emit('request_submitted', request)
  })

  socket.on('resolve_request', ({ requestId, approved } = {}) => {
    const session = getSession(socket)
    if (!session) return sendError(socket, 'Join a room before reviewing requests.', 'NOT_IN_ROOM')
    if (!session.room.isManager(session.userId)) return sendError(socket, 'Only the host or a moderator can review requests.', 'FORBIDDEN')
    const pending = session.room.requests.get(requestId)
    if (!pending) return sendError(socket, 'That request is no longer pending.', 'REQUEST_NOT_FOUND')
    const request = session.room.resolveRequest(requestId, Boolean(approved), session.userId)
    io.to(session.room.id).emit('request_resolved', request)
    if (approved) {
      const result = applyAction(session.room, session.userId, request.type, request.payload)
      if (result.error) sendError(socket, result.error, 'INVALID_ACTION')
    }
  })

  socket.on('assign_role', ({ userId, role } = {}) => {
    const session = getSession(socket)
    if (!session) return sendError(socket, 'Join a room before managing roles.', 'NOT_IN_ROOM')
    if (!session.room.isHost(session.userId)) return sendError(socket, 'Only the host can assign roles.', 'FORBIDDEN')
    if (![ROLES.MODERATOR, ROLES.PARTICIPANT, ROLES.VIEWER].includes(role)) return sendError(socket, 'That role is not available.', 'INVALID_ROLE')
    if (userId === session.room.hostId) return sendError(socket, 'The host role cannot be changed here.', 'INVALID_ROLE')
    const participant = session.room.assignRole(userId, role)
    if (!participant) return sendError(socket, 'Participant not found.', 'PARTICIPANT_NOT_FOUND')
    io.to(session.room.id).emit('role_assigned', {
      userId,
      username: participant.username,
      role,
      ...participantPayload(session.room),
    })
  })

  socket.on('remove_participant', ({ userId } = {}) => {
    const session = getSession(socket)
    if (!session) return sendError(socket, 'Join a room before managing participants.', 'NOT_IN_ROOM')
    if (!session.room.isHost(session.userId)) return sendError(socket, 'Only the host can remove participants.', 'FORBIDDEN')
    if (userId === session.userId) return sendError(socket, 'Use Leave room if you want to exit.', 'INVALID_ACTION')
    const target = session.room.getParticipant(userId)
    if (!target) return sendError(socket, 'Participant not found.', 'PARTICIPANT_NOT_FOUND')
    const targetSocket = io.sockets.sockets.get(target.socketId)
    session.room.removeParticipant(userId)
    if (targetSocket) {
      targetSocket.leave(session.room.id)
      targetSocket.data.roomId = null
      targetSocket.data.userId = null
      targetSocket.emit('participant_removed', { userId, reason: 'Removed by the host.' })
    }
    io.to(session.room.id).emit('participant_removed', { userId, ...participantPayload(session.room) })
    roomManager.removeIfEmpty(session.room.id)
  })

  socket.on('transfer_host', ({ userId } = {}) => {
    const session = getSession(socket)
    if (!session) return sendError(socket, 'Join a room before transferring host.', 'NOT_IN_ROOM')
    if (!session.room.isHost(session.userId)) return sendError(socket, 'Only the host can transfer host.', 'FORBIDDEN')
    const transfer = session.room.transferHost(userId)
    if (!transfer) return sendError(socket, 'Choose an active participant.', 'PARTICIPANT_NOT_FOUND')
    io.to(session.room.id).emit('host_transferred', {
      newHostId: transfer.nextHost.id,
      previousHostId: transfer.previousHost.id,
      ...participantPayload(session.room),
    })
  })

  socket.on('reaction', ({ emoji } = {}) => {
    const session = getSession(socket)
    if (!session) return sendError(socket, 'Join a room before reacting.', 'NOT_IN_ROOM')
    if (!REACTION_EMOJIS.has(emoji)) return sendError(socket, 'That reaction is not available.', 'INVALID_REACTION')

    const now = Date.now()
    if (now - (socket.data.lastReactionAt || 0) < REACTION_COOLDOWN_MS) return
    socket.data.lastReactionAt = now

    io.to(session.room.id).emit('reaction', {
      id: `reaction_${nanoid(8)}`,
      emoji,
      userId: session.userId,
      username: session.participant.username,
      createdAt: now,
    })
  })

  socket.on('chat_message', ({ text } = {}) => {
    const session = getSession(socket)
    if (!session) return sendError(socket, 'Join a room before chatting.', 'NOT_IN_ROOM')
    const message = session.room.addMessage({ userId: session.userId, text })
    if (message) io.to(session.room.id).emit('chat_message', message)
  })

  socket.on('disconnect', () => leaveSession(socket))
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDist))
  app.get('*', (_request, response) => response.sendFile(path.join(clientDist, 'index.html')))
}

async function startServer() {
  try {
    await initialiseDatabase(databasePool)
    await verifyDatabase(databasePool)
    server.listen(port, () => {
      console.log(`Watchtower server listening on http://localhost:${port} with PostgreSQL connected`)
    })
  } catch (error) {
    console.error('Unable to start Watchtower because PostgreSQL is unavailable. Check DATABASE_URL in .env.', error)
    await databasePool.end().catch(() => {})
    process.exitCode = 1
  }
}

void startServer()
