// Thin client for the FastAPI backend. Everything goes through the /api dev
// proxy so the same code works on localhost and over Tailscale.

const BASE = '/api'

async function req<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`)
  return resp.json()
}

const get = <T,>(path: string) => req<T>(path)
const post = <T,>(path: string, body?: unknown) =>
  req<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })

// ---- Types ----
export interface Health {
  status: string
  agent_on: boolean
  integrations: Record<string, boolean>
}
export interface ChatTurn { role: string; content: string }
export interface ApprovalItem {
  id: number
  action_type: string
  description: string
  preview: Record<string, unknown>
  created_at: string
  expires_at: string | null
}
export interface HudEvent {
  id: string
  title: string
  start_at: string
  end_at: string | null
  location: string
  category: string
  source: string
  certain: boolean
}
export interface DeadlineItem {
  id: number; title: string; type: string; course: string; due_at: string; source: string
}
export interface HoldingRow {
  ticker: string; shares: number; cost_basis: number; target_pct: number
  price?: number | null; change_pct?: string | null; value?: number | null
  gain_pct?: number | null; actual_pct?: number | null; drift?: number
}
export interface Portfolio {
  holdings: HoldingRow[]; total_value: number | null; total_gain_pct: number | null
  prices_available: boolean; disclaimer: string
}
export interface SplitDay { day: string; focus: string; exercises: { name: string; sets: string; reps: string }[] }
export interface CleanupEntry {
  id: number; account: string; message_id: string; subject: string
  sender: string; action: string; confidence: number; at: string
}
export interface InboxMsg {
  id: string; account: string; subject: string; sender: string; date: string
  snippet: string; unread: boolean; needs_reply?: boolean; deadline_flag?: boolean
}
export interface SyllabusExtraction {
  error?: string
  course_name?: string
  instructor?: string
  meetings?: { days: string[]; start_time: string; end_time: string; location: string; type: string; first_date: string; last_date: string }[]
  dated_items?: { title: string; type: string; date: string; time: string }[]
}

// ---- API ----
export const api = {
  health: () => get<Health>('/health'),
  agentStart: () => post<{ status: string; greeting: string }>('/agent/start'),
  agentStop: () => post<{ status: string }>('/agent/stop'),
  chat: (message: string) => post<{ reply: string }>('/chat', { message }),
  chatHistory: () => get<{ history: ChatTurn[] }>('/chat/history'),

  approvals: () => get<{ approvals: ApprovalItem[] }>('/approvals'),
  approve: (id: number) => post<{ status: string }>(`/approvals/${id}/approve`),
  reject: (id: number) => post<{ status: string }>(`/approvals/${id}/reject`),

  calendarEvents: (daysBack = 1, daysForward = 31) =>
    get<{ events: HudEvent[] }>(`/calendar/events?days_back=${daysBack}&days_forward=${daysForward}`),
  deadlines: (days = 30) => get<{ deadlines: DeadlineItem[] }>(`/deadlines?days=${days}`),

  syllabusUpload: async (file: File): Promise<SyllabusExtraction> => {
    const form = new FormData()
    form.append('file', file)
    const resp = await fetch(`${BASE}/syllabus/upload`, { method: 'POST', body: form })
    return resp.json()
  },
  syllabusCommit: (data: SyllabusExtraction) =>
    post<{ course: string; meetings_added: number; deadlines_added: number }>('/syllabus/commit', data),
  brightspaceSync: () => post<{ new: number; updated?: number }>('/brightspace/sync'),

  inbox: () => get<{ inbox: InboxMsg[] }>('/email/inbox'),
  cleanupRun: () => post<{ moved: string[]; queued_for_approval: string[] }>('/email/cleanup'),
  cleanupLog: () => get<{ log: CleanupEntry[] }>('/cleanup/log'),
  cleanupUndo: (messageId: string) => post('/cleanup/undo', { message_id: messageId }),

  portfolio: () => get<Portfolio>('/portfolio'),
  setHolding: (h: { ticker: string; shares: number; cost_basis: number; target_pct: number }) =>
    post('/portfolio/holding', h),
  deepPrompt: () => get<{ paste_this?: string; note?: string }>('/portfolio/deep-prompt'),

  workout: () => get<{ split: SplitDay[] }>('/workout'),
  setWorkoutDay: (day: string, focus: string, exercises: string) =>
    post('/workout/day', { day, focus, exercises }),

  brief: () => get<{ text?: string; date?: string; note?: string }>('/brief'),
  briefRun: () => post('/brief/run'),
  catchup: () => get<{ changes: string[] }>('/catchup'),

  googleConnect: () => post<{ status?: string; error?: string }>('/preferences/google/connect'),
  outlookConnect: () => post<{ user_code?: string; verification_uri?: string; message?: string; error?: string }>('/preferences/outlook/connect'),
  outlookPoll: () => post<{ status?: string; error?: string }>('/preferences/outlook/poll'),
  icloudSave: (email: string, appPassword: string) =>
    post<{ status?: string; error?: string; note?: string }>('/preferences/icloud', { email, app_password: appPassword }),

  profile: () => get<{ profile: Record<string, string> }>('/account/profile'),
  saveProfile: (facts: Record<string, string>) => post('/account/profile', { facts }),
}
