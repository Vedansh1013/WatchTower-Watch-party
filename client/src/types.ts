export type Role = 'host' | 'moderator' | 'participant' | 'viewer'

export interface AuthenticatedUser {
  id: string
  name: string
  email: string
  createdAt: number
}

export interface AuthSession {
  user: AuthenticatedUser
  token: string
}

export interface Participant {
  id: string
  username: string
  role: Role
  joinedAt: number
}

export interface PlaybackState {
  videoId: string
  playing: boolean
  currentTime: number
  updatedAt: number
}

export interface ChatMessage {
  id: string
  userId: string
  username: string
  text: string
  createdAt: number
}

export interface RoomReaction {
  id: string
  emoji: string
  userId: string
  username: string
  createdAt: number
}

export interface ApprovalRequest {
  id: string
  requestedBy: string
  username: string
  type: 'play' | 'pause' | 'seek' | 'change_video'
  payload: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
  resolvedBy?: string
  resolvedAt?: number
}

export interface RoomSnapshot {
  id: string
  code: string
  createdAt: number
  hostId: string
  participants: Participant[]
  state: PlaybackState
  messages: ChatMessage[]
  pendingRequests: ApprovalRequest[]
  selfId?: string
}

export interface RoomHistoryEntry {
  id: number
  roomId: string
  roomCode: string
  activity: 'created' | 'joined'
  firstJoinedAt: number
  lastJoinedAt: number
}
