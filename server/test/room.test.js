import test from 'node:test'
import assert from 'node:assert/strict'
import { Room } from '../room.js'
import { ROLES } from '../room.js'
import { RoomManager } from '../roomManager.js'
import { AuthStore, isValidPassword, passwordChecks } from '../authStore.js'
import { initialiseDatabase, prepareDatabaseUrl } from '../database.js'

function makeRoom() {
  return new Room({
    id: 'room_test',
    code: 'ABC123',
    host: { id: 'host_1', username: 'Host', socketId: 'socket_host' },
  })
}

function makeAuthPool() {
  const usersByEmail = new Map()
  const usersById = new Map()
  const sessions = new Map()
  const roomHistory = []

  return {
    async query(statement, values = []) {
      const sql = statement.replace(/\s+/g, ' ').trim()

      if (sql === 'SELECT 1 FROM users WHERE email = $1 LIMIT 1') {
        return { rowCount: usersByEmail.has(values[0]) ? 1 : 0, rows: [] }
      }

      if (sql.startsWith('INSERT INTO users')) {
        const [id, name, email, passwordHash] = values
        const user = { id, name, email, passwordHash, createdAt: new Date('2026-01-01T00:00:00.000Z') }
        usersByEmail.set(email, user)
        usersById.set(id, user)
        return { rowCount: 1, rows: [{ id, name, email, createdAt: user.createdAt }] }
      }

      if (sql.includes('password_hash AS "passwordHash"') && sql.includes('FROM users')) {
        const user = usersByEmail.get(values[0])
        return { rowCount: user ? 1 : 0, rows: user ? [user] : [] }
      }

      if (sql === 'DELETE FROM sessions WHERE expires_at <= NOW()') {
        for (const [token, session] of sessions) {
          if (session.expiresAt <= new Date()) sessions.delete(token)
        }
        return { rowCount: 0, rows: [] }
      }

      if (sql.startsWith('INSERT INTO sessions')) {
        const [token, userId, expiresAt] = values
        sessions.set(token, { userId, expiresAt })
        return { rowCount: 1, rows: [{ token }] }
      }

      if (sql.includes('FROM sessions') && sql.includes('INNER JOIN users')) {
        const session = sessions.get(values[0])
        const user = session && session.expiresAt > new Date() ? usersById.get(session.userId) : null
        return { rowCount: user ? 1 : 0, rows: user ? [{ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt }] : [] }
      }

      if (sql === 'DELETE FROM sessions WHERE token = $1') {
        return { rowCount: sessions.delete(values[0]) ? 1 : 0, rows: [] }
      }

      if (sql.startsWith('INSERT INTO room_history')) {
        const [userId, roomId, roomCode, activity] = values
        const now = new Date()
        let entry = roomHistory.find((item) => item.userId === userId && item.roomId === roomId)
        if (entry) {
          entry.roomCode = roomCode
          entry.activity = entry.activity === 'created' ? 'created' : activity
          entry.lastJoinedAt = now
        } else {
          entry = {
            id: roomHistory.length + 1,
            userId,
            roomId,
            roomCode,
            activity,
            firstJoinedAt: now,
            lastJoinedAt: now,
          }
          roomHistory.push(entry)
        }
        return { rowCount: 1, rows: [entry] }
      }

      if (sql.includes('FROM room_history')) {
        const entries = roomHistory
          .filter((entry) => entry.userId === values[0])
          .sort((left, right) => right.lastJoinedAt - left.lastJoinedAt)
        return { rowCount: entries.length, rows: entries }
      }

      throw new Error(`Unexpected query in test double: ${sql}`)
    },
  }
}

test('rooms give the creator host control and joiners participant access', () => {
  const room = makeRoom()
  room.addParticipant({ id: 'user_2', username: 'Asha', socketId: 'socket_2' })

  assert.equal(room.isHost('host_1'), true)
  assert.equal(room.canControl('host_1'), true)
  assert.equal(room.canControl('user_2'), false)
})

test('role assignment promotes a participant without changing the host', () => {
  const room = makeRoom()
  room.addParticipant({ id: 'user_2', username: 'Asha', socketId: 'socket_2' })
  const promoted = room.assignRole('user_2', ROLES.MODERATOR)

  assert.equal(promoted.role, ROLES.MODERATOR)
  assert.equal(room.canControl('user_2'), true)
  assert.equal(room.hostId, 'host_1')
})

test('host transfer promotes the next member before the former host leaves', () => {
  const room = makeRoom()
  room.addParticipant({ id: 'user_2', username: 'Asha', socketId: 'socket_2' })
  const transfer = room.transferHost('user_2')
  room.removeParticipant('host_1')

  assert.equal(transfer.nextHost.id, 'user_2')
  assert.equal(room.hostId, 'user_2')
  assert.equal(room.getParticipant('user_2')?.role, ROLES.HOST)
})

test('playback updates are authoritative and bounded', () => {
  const room = makeRoom()
  room.setPlayback(true, 999999)

  assert.equal(room.state.playing, true)
  assert.equal(room.state.currentTime, 24 * 60 * 60)
  assert.equal(typeof room.state.updatedAt, 'number')
})

test('a controller heartbeat refreshes the room timeline without broadcasting a new action', () => {
  const room = makeRoom()
  room.setPlayback(true, 5)
  room.refreshPlaybackTime(42.5)

  assert.equal(room.state.playing, true)
  assert.equal(room.state.currentTime, 42.5)
})

test('room manager resolves both codes and shared links', () => {
  const manager = new RoomManager()
  const room = manager.createRoom({ username: 'Host', socketId: 'socket_host' })

  assert.equal(manager.getRoom(room.code)?.id, room.id)
  assert.equal(manager.getRoom(`https://watchtower.example/room/${room.code}`)?.id, room.id)
})

test('account passwords require length, upper and lowercase letters, and a number', () => {
  assert.equal(isValidPassword('Abc12'), true)
  assert.equal(isValidPassword('abc12'), false)
  assert.equal(isValidPassword('ABC12'), false)
  assert.equal(isValidPassword('Abcde'), false)
  assert.equal(isValidPassword('Ab1'), false)
  assert.deepEqual(passwordChecks('Abc12'), { length: true, uppercase: true, lowercase: true, number: true })
})

test('database initialization installs account and room-history schema', async () => {
  const statements = []
  await initialiseDatabase({ query: async (statement) => { statements.push(statement) } })

  assert.equal(statements.length, 6)
  assert.match(statements[0], /CREATE TABLE IF NOT EXISTS users/)
  assert.match(statements[1], /CREATE TABLE IF NOT EXISTS sessions/)
  assert.match(statements[2], /sessions_user_id_idx/)
  assert.match(statements[3], /sessions_expires_at_idx/)
  assert.match(statements[4], /CREATE TABLE IF NOT EXISTS room_history/)
  assert.match(statements[5], /room_history_user_recent_idx/)
})

test('Render external PostgreSQL URLs automatically enable TLS', () => {
  const url = prepareDatabaseUrl('postgresql://user:password@dpg-demo-a.singapore-postgres.render.com/watchtower')
  assert.match(url, /sslmode=require/)
  assert.equal(prepareDatabaseUrl(`${url}&application_name=watchtower`).match(/sslmode=require/g)?.length, 1)
})

test('PostgreSQL account storage registers users and restores sessions without exposing a password', async () => {
  const store = new AuthStore(makeAuthPool())
  const registration = await store.register({ name: 'Pavitra', email: 'PAVITRA@example.com', password: 'Watch1' })

  assert.equal(registration.error, undefined)
  assert.equal(registration.user.name, 'Pavitra')
  assert.equal(registration.user.email, 'pavitra@example.com')
  assert.equal('password' in registration.user, false)

  const token = await store.createSession(registration.user.id)
  assert.ok(token)
  assert.deepEqual(await store.getSession(token), registration.user)
  assert.equal((await store.authenticate({ email: 'pavitra@example.com', password: 'Watch1' }))?.id, registration.user.id)
  assert.equal(await store.authenticate({ email: 'pavitra@example.com', password: 'Wrong1' }), null)
  assert.equal((await store.register({ name: 'Pavitra', email: 'pavitra@example.com', password: 'Watch1' })).error?.code, 'EMAIL_TAKEN')

  const historyEntry = await store.recordRoomHistory({
    userId: registration.user.id,
    roomId: 'room_history_test',
    roomCode: 'WATCH1',
    activity: 'created',
  })
  await store.recordRoomHistory({
    userId: registration.user.id,
    roomId: 'room_history_test',
    roomCode: 'WATCH1',
    activity: 'joined',
  })
  const history = await store.getRoomHistory(registration.user.id)
  assert.equal(history.length, 1)
  assert.equal(historyEntry.activity, 'created')
  assert.equal(history[0].activity, 'created')
  assert.equal(history[0].roomCode, 'WATCH1')

  assert.equal(await store.revokeSession(token), true)
  assert.equal(await store.getSession(token), null)
})
