// =============================================================================
// src/components/shared/AvatarUpload.jsx
// Self-service profile image upload widget.
//
// Displays the current profile photo (or initials fallback), and lets the user
// click it to select a new JPG/PNG (max 2 MB). The file is uploaded immediately;
// on success, refreshProfile() is called so the top-nav avatar updates without
// a page reload.
//
// Accepts:
//   firstName    {string}  — used for initials + avatar colour
//   lastName     {string}
//   imageUrl     {string|null}  — current profile_image_url
//   onUpload     {(file) => Promise<{ profile_image_url }>}  — upload fn
//   onSuccess    {() => void}   — called after a successful upload
//   size         {number}  — avatar diameter in px (default 80)
//
// Spec s.4.1 | FR-04 | NFR-02
// =============================================================================

import { useRef, useState } from 'react'
import { Camera, Loader2 }  from 'lucide-react'

// ── Deterministic avatar colour ───────────────────────────────────────────────
const COLOURS = [
  { bg: '#3b82f6', text: '#fff' },
  { bg: '#6366f1', text: '#fff' },
  { bg: '#0ea5e9', text: '#fff' },
  { bg: '#14b8a6', text: '#fff' },
  { bg: '#8b5cf6', text: '#fff' },
  { bg: '#f59e0b', text: '#fff' },
]
function avatarColour(name = '') {
  return COLOURS[(name.charCodeAt(0) || 0) % COLOURS.length]
}
function initials(first = '', last = '') {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?'
}

const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED   = ['image/jpeg', 'image/jpg', 'image/png']

// ── Component ─────────────────────────────────────────────────────────────────
export default function AvatarUpload({
  firstName = '',
  lastName  = '',
  imageUrl  = null,
  onUpload,
  onSuccess,
  size = 80,
}) {
  const inputRef = useRef(null)
  const [preview,  setPreview]  = useState(null)   // local blob preview
  const [uploading, setUploading] = useState(false)
  const [error,    setError]    = useState('')

  const colour = avatarColour(firstName)
  const ini    = initials(firstName, lastName)
  const src    = preview || imageUrl

  // ── Handle file selection ─────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Client-side validation
    if (!ALLOWED.includes(file.type)) {
      setError('Only JPG and PNG images are accepted.')
      e.target.value = ''
      return
    }
    if (file.size > MAX_BYTES) {
      setError('Image must be smaller than 2 MB.')
      e.target.value = ''
      return
    }

    setError('')
    // Show local preview immediately
    setPreview(URL.createObjectURL(file))

    // Upload
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('profile_image', file)
      await onUpload(fd)
      onSuccess?.()
    } catch (err) {
      setError(err?.response?.data?.message || 'Upload failed. Please try again.')
      setPreview(null)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {/* ── Clickable avatar ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        title="Change profile photo"
        style={{
          position:     'relative',
          width:        size,
          height:       size,
          borderRadius: '50%',
          overflow:     'hidden',
          cursor:       uploading ? 'wait' : 'pointer',
          flexShrink:   0,
          border:       '2px solid #e2e8f0',
        }}
      >
        {/* Avatar image or initials */}
        {src ? (
          <img
            src={src}
            alt="Profile"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span
            style={{
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              width:           '100%',
              height:          '100%',
              backgroundColor: colour.bg,
              color:           colour.text,
              fontWeight:      600,
              fontSize:        size * 0.36,
              userSelect:      'none',
            }}
          >
            {ini}
          </span>
        )}

        {/* Hover / uploading overlay */}
        <span
          style={{
            position:        'absolute',
            inset:           0,
            display:         'flex',
            flexDirection:   'column',
            alignItems:      'center',
            justifyContent:  'center',
            backgroundColor: uploading ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
            transition:      'background-color 0.15s',
            gap:             4,
          }}
          className="avatar-overlay"
        >
          {uploading ? (
            <Loader2
              className="animate-spin"
              style={{ width: size * 0.3, height: size * 0.3, color: '#fff' }}
            />
          ) : (
            <Camera
              style={{
                width:   size * 0.28,
                height:  size * 0.28,
                color:   '#fff',
                opacity: 0,
                transition: 'opacity 0.15s',
              }}
              className="avatar-camera"
            />
          )}
        </span>
      </button>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Click hint */}
      {!uploading && (
        <p className="text-xs text-slate-400 select-none">Click to change photo</p>
      )}
      {uploading && (
        <p className="text-xs text-slate-400 select-none">Uploading…</p>
      )}

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 text-center max-w-[160px]">{error}</p>
      )}

      {/* Hover CSS injected inline — avoids adding a stylesheet */}
      <style>{`
        button:hover .avatar-overlay { background-color: rgba(0,0,0,0.38) !important; }
        button:hover .avatar-camera  { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
