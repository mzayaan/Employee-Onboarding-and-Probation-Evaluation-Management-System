// =============================================================================
// src/pages/notifications/NotificationsPage.jsx
// In-app notification centre — all authenticated roles.
// FR-09 | Objective 1 & 2
// =============================================================================

import { useEffect, useState, useCallback } from 'react'
import AppShell from '@/components/shared/AppShell'
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
} from '@/api/notificationApi'
import { Bell, CheckCheck, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ── Notification type → colour mapping ────────────────────────────────────────
const TYPE_STYLES = {
  DOCUMENT_PENDING:  { dot: 'bg-yellow-400', label: 'Document Pending'  },
  DOCUMENT_APPROVED: { dot: 'bg-green-500',  label: 'Document Approved' },
  DOCUMENT_REJECTED: { dot: 'bg-red-500',    label: 'Document Rejected' },
  TASK_ASSIGNED:     { dot: 'bg-blue-500',   label: 'Task Assigned'     },
  TASK_OVERDUE:      { dot: 'bg-orange-500', label: 'Task Overdue'      },
  EVAL_DUE:          { dot: 'bg-purple-500', label: 'Evaluation Due'    },
  EVAL_OVERDUE:      { dot: 'bg-red-600',    label: 'Evaluation Overdue'},
  ACCOUNT_CREATED:   { dot: 'bg-teal-500',   label: 'Account Created'   },
  PDF_GENERATED:     { dot: 'bg-slate-500',  label: 'Report Ready'      },
  PROBATION_COMPLETE:{ dot: 'bg-indigo-500', label: 'Probation Complete'},
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 1)  return 'Just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount,   setUnreadCount]   = useState(0)
  const [loading,       setLoading]       = useState(true)
  const [filter,        setFilter]        = useState('all')   // 'all' | 'unread'

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await getNotifications(filter === 'unread')
      setNotifications(res.data || [])
      setUnreadCount(res.unreadCount || 0)
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const handleMarkRead = async (id) => {
    await markAsRead(id)
    setNotifications((prev) =>
      prev.map((n) => n.notification_id === id ? { ...n, is_read: true } : n)
    )
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  const handleMarkAll = async () => {
    await markAllAsRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: '#e8f0fb' }}
          >
            <Bell className="h-5 w-5" style={{ color: '#3d7dd3' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Notifications</h1>
            <p className="text-sm text-slate-500">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter tabs */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            {['all', 'unread'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 font-medium transition-colors ${
                  filter === f
                    ? 'text-white'
                    : 'text-slate-500 hover:text-slate-700 bg-white'
                }`}
                style={filter === f ? { backgroundColor: '#3d7dd3' } : {}}
              >
                {f === 'all' ? 'All' : 'Unread'}
              </button>
            ))}
          </div>

          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAll}
              className="flex items-center gap-1.5 text-sm"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
            Loading…
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Bell className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No notifications</p>
            <p className="text-xs mt-1">
              {filter === 'unread' ? 'You have no unread notifications.' : 'Nothing here yet.'}
            </p>
          </div>
        ) : (
          notifications.map((n) => {
            const style = TYPE_STYLES[n.type] || { dot: 'bg-slate-400', label: n.type }
            return (
              <div
                key={n.notification_id}
                onClick={() => !n.is_read && handleMarkRead(n.notification_id)}
                className={`flex items-start gap-4 rounded-xl border px-5 py-4 transition-colors cursor-pointer ${
                  n.is_read
                    ? 'bg-white border-slate-100 text-slate-500'
                    : 'bg-blue-50 border-blue-100 hover:bg-blue-100'
                }`}
              >
                {/* Colour dot */}
                <span className={`mt-1.5 h-2.5 w-2.5 rounded-full flex-shrink-0 ${style.dot}`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {style.label}
                    </span>
                    {!n.is_read && (
                      <Circle className="h-2 w-2 fill-blue-500 text-blue-500" />
                    )}
                  </div>
                  <p className={`text-sm leading-snug ${n.is_read ? 'text-slate-500' : 'text-slate-800 font-medium'}`}>
                    {n.message}
                  </p>
                </div>

                {/* Time */}
                <span className="text-xs text-slate-400 flex-shrink-0 mt-0.5">
                  {timeAgo(n.created_at)}
                </span>
              </div>
            )
          })
        )}
      </div>
    </AppShell>
  )
}
