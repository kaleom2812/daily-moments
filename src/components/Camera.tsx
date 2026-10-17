import { useCallback, useEffect, useRef, useState } from 'react'
import { toJpeg, uploadPhoto } from '../lib/photos'
import { Button, Notice } from './ui'

type Shot = { blob: Blob; url: string; clientId: string; capturedAt: Date }

export default function Camera({ onClose, onUploaded }: { onClose: () => void; onUploaded: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [facing, setFacing] = useState<'environment' | 'user'>('environment')
  const [camError, setCamError] = useState('')
  const [shot, setShot] = useState<Shot | null>(null)
  const [caption, setCaption] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState('')

  const stop = () => stream.current?.getTracks().forEach((t) => t.stop())

  const start = useCallback(async (mode: 'environment' | 'user') => {
    stop()
    if (!navigator.mediaDevices?.getUserMedia) return setCamError('This browser cannot open the camera. Choose a photo instead.')
    try {
      // Permission is requested here, only when the camera screen opens.
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: false })
      stream.current = s
      setCamError('')
      if (video.current) video.current.srcObject = s
    } catch (e) {
      const denied = e instanceof DOMException && e.name === 'NotAllowedError'
      setCamError(denied ? 'Camera permission was denied. Allow it in your browser settings, or choose a photo instead.' : 'Camera unavailable. Choose a photo instead.')
    }
  }, [])

  useEffect(() => {
    if (!shot) start(facing)
    return stop
  }, [facing, shot, start])

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url) }, [shot])

  async function setFromBlob(b: Blob) {
    try {
      const jpeg = await toJpeg(b)
      stop()
      // clientId is fixed per shot, so retries and double taps cannot create duplicates.
      setShot({ blob: jpeg, url: URL.createObjectURL(jpeg), clientId: crypto.randomUUID(), capturedAt: new Date() })
      setError('')
    } catch {
      setError('Could not read that image.')
    }
  }

  function snap() {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob((b) => b && setFromBlob(b), 'image/jpeg', 0.92)
  }

  async function upload() {
    if (!shot || progress !== null) return
    setError('')
    setProgress(0)
    try {
      await uploadPhoto(shot.blob, caption, shot.clientId, shot.capturedAt, setProgress)
      onUploaded()
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setProgress(null)
    }
  }

  const uploading = progress !== null

  return (
    <div role="dialog" aria-modal="true" aria-label="Capture a photo" className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between p-4">
        <button onClick={onClose} disabled={uploading} className="min-h-11 px-2">Close</button>
        {!shot && !camError && (
          <button onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')} className="min-h-11 px-2">Flip camera</button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        {shot ? (
          <img src={shot.url} alt="Captured preview" className="max-h-full max-w-full object-contain" />
        ) : camError ? (
          <div className="max-w-sm space-y-4 p-6 text-center"><Notice kind="error">{camError}</Notice></div>
        ) : (
          <video ref={video} autoPlay playsInline muted className="max-h-full max-w-full" />
        )}
      </div>

      <div className="space-y-3 bg-black p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {error && <Notice kind="error">{error}</Notice>}
        {shot ? (
          <>
            <input
              aria-label="Optional note" placeholder="Add a note (optional)" maxLength={500} value={caption}
              onChange={(e) => setCaption(e.target.value)} disabled={uploading}
              className="min-h-11 w-full rounded-xl bg-white/10 px-4 text-base"
            />
            {uploading && <progress value={progress} max={100} aria-label="Upload progress" className="w-full" />}
            <div className="flex gap-3">
              <button onClick={() => setShot(null)} disabled={uploading} className="min-h-11 flex-1 rounded-full border border-white/40">Retake</button>
              <Button onClick={upload} disabled={uploading} className="flex-1">
                {uploading ? `Uploading ${progress}%` : error ? 'Retry upload' : 'Upload'}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center gap-6">
            {!camError && (
              <button onClick={snap} aria-label="Take photo" className="size-18 rounded-full border-4 border-white bg-white/20" />
            )}
            {/* Fallback / alternative: native picker (opens the camera app on phones). */}
            <label className="min-h-11 cursor-pointer rounded-full border border-white/40 px-5 py-2.5 text-sm">
              Choose a photo
              <input type="file" accept="image/*" capture="environment" className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFromBlob(f); e.target.value = '' }} />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
