import { nanoid } from 'nanoid'

export const ROLES = Object.freeze({
  HOST: 'host',
  MODERATOR: 'moderator',
  PARTICIPANT: 'participant',
  VIEWER: 'viewer',
})

export const CONTROL_ROLES = new Set([ROLES.HOST, ROLES.MODERATOR])
export const ASSIGNABLE_ROLES = new Set([ROLES.MODERATOR, ROLES.PARTICIPANT, ROLES.VIEWER])

const DEFAULT_VIDEO_ID = 'M7lc1UVf-VE'

function cleanText(value, maxLength = 80) {
  return String(value ?? '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function clampTime(value) {
  const time = Number(value)
  if (!Number.isFinite(time)) return 0
  return Math.max(0, Math.min(time, 24 * 60 * 60))
}

export class Participant {
  constructor({ id, username, role, socketId }) {
    this.id = id
    this.username = cleanText(username, 24) || 'Guest'
    this.role = role
    this.socketId = socketId
    this.joinedAt = Date.now()
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      role: this.role,
      joinedAt: this.joinedAt,
    }
  }
}

export class Room {
  constructor({ id, code, host }) {
    this.id = id
    this.code = code
    this.createdAt = Date.now()
    this.hostId = host.id
    this.lastControllerId = host.id
    this.participants = new Map()
    this.messages = []
    this.requests = new Map()
    this.state = {
      videoId: DEFAULT_VIDEO_ID,
      playing: false,
      currentTime: 0,
      updatedAt: Date.now(),
    }
    this.addParticipant({ ...host, role: ROLES.HOST })
  }

  addParticipant({ id, username, role = ROLES.PARTICIPANT, socketId }) {
    const participant = new Participant({ id, username, role, socketId })
    this.participants.set(id, participant)
    return participant
  }

  getParticipant(userId) {
    return this.participants.get(userId)
  }

  hasParticipant(userId) {
    return this.participants.has(userId)
  }

  removeParticipant(userId) {
    const participant = this.participants.get(userId)
    if (!participant) return null
    this.participants.delete(userId)
    this.requests.forEach((request, requestId) => {
      if (request.requestedBy === userId) this.requests.delete(requestId)
    })
    return participant
  }

  canControl(userId) {
    const participant = this.getParticipant(userId)
    return Boolean(participant && CONTROL_ROLES.has(participant.role))
  }

  isHost(userId) {
    return this.hostId === userId
  }

  isManager(userId) {
    return this.isHost(userId) || this.getParticipant(userId)?.role === ROLES.MODERATOR
  }

  setPlayback(playing, currentTime = this.state.currentTime) {
    this.state = {
      ...this.state,
      playing: Boolean(playing),
      currentTime: clampTime(currentTime),
      updatedAt: Date.now(),
    }
    return this.state
  }

  seek(currentTime) {
    this.state = {
      ...this.state,
      currentTime: clampTime(currentTime),
      updatedAt: Date.now(),
    }
    return this.state
  }

  changeVideo(videoId) {
    this.state = {
      ...this.state,
      videoId,
      playing: false,
      currentTime: 0,
      updatedAt: Date.now(),
    }
    return this.state
  }

  refreshPlaybackTime(currentTime) {
    if (!this.state.playing) return this.state
    this.state = {
      ...this.state,
      currentTime: clampTime(currentTime),
      updatedAt: Date.now(),
    }
    return this.state
  }

  assignRole(userId, role) {
    const participant = this.getParticipant(userId)
    if (!participant || !ASSIGNABLE_ROLES.has(role)) return null
    participant.role = role
    return participant
  }

  transferHost(newHostId) {
    const nextHost = this.getParticipant(newHostId)
    const previousHost = this.getParticipant(this.hostId)
    if (!nextHost || !previousHost) return null
    previousHost.role = ROLES.MODERATOR
    nextHost.role = ROLES.HOST
    this.hostId = newHostId
    this.lastControllerId = newHostId
    return { previousHost, nextHost }
  }

  addRequest({ requestedBy, type, payload }) {
    const requester = this.getParticipant(requestedBy)
    if (!requester) return null
    const request = {
      id: `request_${nanoid(10)}`,
      requestedBy,
      username: requester.username,
      type,
      payload,
      status: 'pending',
      createdAt: Date.now(),
    }
    this.requests.set(request.id, request)
    return request
  }

  resolveRequest(requestId, approved, resolvedBy) {
    const request = this.requests.get(requestId)
    if (!request || request.status !== 'pending') return null
    request.status = approved ? 'approved' : 'rejected'
    request.resolvedBy = resolvedBy
    request.resolvedAt = Date.now()
    this.requests.delete(requestId)
    return request
  }

  addMessage({ userId, text }) {
    const participant = this.getParticipant(userId)
    if (!participant) return null
    const message = {
      id: `message_${nanoid(10)}`,
      userId,
      username: participant.username,
      text: cleanText(text, 500),
      createdAt: Date.now(),
    }
    if (!message.text) return null
    this.messages.push(message)
    if (this.messages.length > 100) this.messages.shift()
    return message
  }

  participantsSnapshot() {
    return Array.from(this.participants.values())
      .sort((a, b) => {
        if (a.role === ROLES.HOST) return -1
        if (b.role === ROLES.HOST) return 1
        return a.joinedAt - b.joinedAt
      })
      .map((participant) => participant.toJSON())
  }

  snapshot() {
    return {
      id: this.id,
      code: this.code,
      createdAt: this.createdAt,
      hostId: this.hostId,
      participants: this.participantsSnapshot(),
      state: this.state,
      messages: this.messages,
      pendingRequests: Array.from(this.requests.values()),
    }
  }
}
