import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normaliseDisplayName(value) {
  return String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24)
}

export function normaliseEmail(value) {
  return String(value ?? '').trim().toLowerCase().slice(0, 120)
}

export function passwordChecks(value) {
  const password = String(value ?? '')
  return {
    length: password.length >= 5,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
  }
}

export function isValidPassword(value) {
  return Object.values(passwordChecks(value)).every(Boolean)
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derivedKey = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${derivedKey}`
}

function passwordMatches(password, storedHash) {
  const [salt, storedKey] = String(storedHash || '').split(':')
  if (!salt || !storedKey) return false
  const calculatedKey = hashPassword(password, salt).split(':')[1]
  const storedBuffer = Buffer.from(storedKey, 'hex')
  const calculatedBuffer = Buffer.from(calculatedKey, 'hex')
  return storedBuffer.length === calculatedBuffer.length && timingSafeEqual(storedBuffer, calculatedBuffer)
}

function toTimestamp(value) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: toTimestamp(user.createdAt),
  }
}

function toRoomHistoryEntry(entry) {
  return {
    id: Number(entry.id),
    roomId: entry.roomId,
    roomCode: entry.roomCode,
    activity: entry.activity,
    firstJoinedAt: toTimestamp(entry.firstJoinedAt),
    lastJoinedAt: toTimestamp(entry.lastJoinedAt),
  }
}

export class AuthStore {
  constructor(pool, { sessionTtlMs = SESSION_TTL_MS } = {}) {
    this.pool = pool
    this.sessionTtlMs = sessionTtlMs
  }

  async register({ name, email, password } = {}) {
    const cleanName = normaliseDisplayName(name)
    const cleanEmail = normaliseEmail(email)

    if (!cleanName) return { error: { code: 'INVALID_NAME', message: 'Enter a name for your profile.' } }
    if (!EMAIL_PATTERN.test(cleanEmail)) return { error: { code: 'INVALID_EMAIL', message: 'Enter a valid email ID.' } }
    if (!isValidPassword(password)) {
      return { error: { code: 'WEAK_PASSWORD', message: 'Use at least 5 characters with an uppercase letter, lowercase letter, and number.' } }
    }

    const existing = await this.pool.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [cleanEmail])
    if (existing.rowCount) return { error: { code: 'EMAIL_TAKEN', message: 'An account already exists for this email ID.' } }

    const user = {
      id: `account_${randomBytes(10).toString('hex')}`,
      name: cleanName,
      email: cleanEmail,
      passwordHash: hashPassword(String(password)),
    }

    try {
      const created = await this.pool.query(
        `INSERT INTO users (id, name, email, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, email, created_at AS "createdAt"`,
        [user.id, user.name, user.email, user.passwordHash],
      )
      return { user: toPublicUser(created.rows[0]) }
    } catch (error) {
      if (error?.code === '23505') {
        return { error: { code: 'EMAIL_TAKEN', message: 'An account already exists for this email ID.' } }
      }
      throw error
    }
  }

  async authenticate({ email, password } = {}) {
    const result = await this.pool.query(
      `SELECT id, name, email, password_hash AS "passwordHash", created_at AS "createdAt"
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [normaliseEmail(email)],
    )
    const user = result.rows[0]
    if (!user || !passwordMatches(String(password ?? ''), user.passwordHash)) return null
    return toPublicUser(user)
  }

  async createSession(userId) {
    if (!userId) return null
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + this.sessionTtlMs)

    await this.pool.query('DELETE FROM sessions WHERE expires_at <= NOW()')
    try {
      const result = await this.pool.query(
        'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3) RETURNING token',
        [token, userId, expiresAt],
      )
      return result.rows[0]?.token || null
    } catch (error) {
      if (error?.code === '23503') return null
      throw error
    }
  }

  async getSession(token) {
    if (!token) return null
    const result = await this.pool.query(
      `SELECT users.id, users.name, users.email, users.created_at AS "createdAt"
       FROM sessions
       INNER JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = $1 AND sessions.expires_at > NOW()
       LIMIT 1`,
      [token],
    )
    return result.rows[0] ? toPublicUser(result.rows[0]) : null
  }

  async revokeSession(token) {
    if (!token) return false
    const result = await this.pool.query('DELETE FROM sessions WHERE token = $1', [token])
    return Boolean(result.rowCount)
  }

  async count() {
    const result = await this.pool.query('SELECT COUNT(*)::int AS count FROM users')
    return Number(result.rows[0]?.count || 0)
  }

  async recordRoomHistory({ userId, roomId, roomCode, activity } = {}) {
    if (!userId || !roomId || !roomCode) return null
    const cleanActivity = activity === 'created' ? 'created' : 'joined'
    const result = await this.pool.query(
      `INSERT INTO room_history (user_id, room_id, room_code, activity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, room_id) DO UPDATE
       SET room_code = EXCLUDED.room_code,
           activity = CASE WHEN room_history.activity = 'created' THEN 'created' ELSE EXCLUDED.activity END,
           last_joined_at = NOW()
       RETURNING id, room_id AS "roomId", room_code AS "roomCode", activity,
                 first_joined_at AS "firstJoinedAt", last_joined_at AS "lastJoinedAt"`,
      [userId, roomId, roomCode, cleanActivity],
    )
    return toRoomHistoryEntry(result.rows[0])
  }

  async getRoomHistory(userId) {
    if (!userId) return []
    const result = await this.pool.query(
      `SELECT id, room_id AS "roomId", room_code AS "roomCode", activity,
              first_joined_at AS "firstJoinedAt", last_joined_at AS "lastJoinedAt"
       FROM room_history
       WHERE user_id = $1
       ORDER BY last_joined_at DESC
       LIMIT 50`,
      [userId],
    )
    return result.rows.map(toRoomHistoryEntry)
  }
}
