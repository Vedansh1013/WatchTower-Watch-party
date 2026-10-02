import { nanoid } from 'nanoid'
import { Room } from './room.js'

function makeCode(existingCodes) {
  let code = ''
  do {
    code = nanoid(6).toUpperCase()
  } while (existingCodes.has(code))
  return code
}

export class RoomManager {
  constructor() {
    this.rooms = new Map()
  }

  createRoom({ id, username, socketId }) {
    const room = new Room({
      id: id || `room_${nanoid(8)}`,
      code: makeCode(new Set(Array.from(this.rooms.values()).map((item) => item.code))),
      host: {
        id: `user_${nanoid(10)}`,
        username,
        socketId,
      },
    })
    this.rooms.set(room.id, room)
    return room
  }

  getRoom(roomIdOrCode) {
    if (!roomIdOrCode) return null
    const rawValue = String(roomIdOrCode).trim()
    const candidates = [rawValue]
    try {
      const parsed = new URL(rawValue)
      const lastPathPart = parsed.pathname.split('/').filter(Boolean).pop()
      if (lastPathPart) candidates.push(lastPathPart)
    } catch {
      const pathPart = rawValue.split('/').filter(Boolean).pop()
      if (pathPart && pathPart !== rawValue) candidates.push(pathPart)
    }

    for (const candidate of candidates) {
      if (this.rooms.has(candidate)) return this.rooms.get(candidate)
      const upperCode = candidate.toUpperCase()
      const match = Array.from(this.rooms.values()).find((room) => room.code === upperCode)
      if (match) return match
    }
    return null
  }

  deleteRoom(roomId) {
    this.rooms.delete(roomId)
  }

  removeIfEmpty(roomId) {
    const room = this.rooms.get(roomId)
    if (room && room.participants.size === 0) this.rooms.delete(roomId)
  }

  count() {
    return this.rooms.size
  }
}
