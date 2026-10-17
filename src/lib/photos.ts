import { supabase } from './supabase'

export type Photo = {
  id: string
  storage_path: string
  caption: string | null
  captured_at: string
  status: 'pending' | 'uploaded' | 'failed'
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }
export const MAX_BYTES = 10 * 1024 * 1024

// XHR instead of supabase-js so we get real upload progress.
function putObject(path: string, blob: Blob, token: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/photos/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
    xhr.setRequestHeader('Content-Type', blob.type)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100))
    xhr.onload = () => {
      // 409 = this exact object already uploaded by an earlier attempt: treat as success.
      if (xhr.status < 300 || xhr.status === 409 || xhr.responseText.includes('already exists')) resolve()
      else reject(new Error('Upload failed. Check your connection and retry.'))
    }
    xhr.onerror = () => reject(new Error('Network error. Retry when you are back online.'))
    xhr.send(blob)
  })
}

// Idempotent: the same clientId can be retried safely at every step.
// The photo counts toward the target only after confirm_photo_upload succeeds.
export async function uploadPhoto(
  blob: Blob, caption: string, clientId: string, capturedAt: Date, onProgress: (pct: number) => void,
): Promise<void> {
  if (!EXT[blob.type]) throw new Error('Unsupported image type.')
  if (blob.size > MAX_BYTES) throw new Error('Photo is larger than 10 MB.')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('You are signed out.')
  const uid = session.user.id
  const path = `${uid}/${clientId}.${EXT[blob.type]}`

  const ins = await supabase.from('photos').insert({
    user_id: uid, client_id: clientId, storage_path: path, mime_type: blob.type, size_bytes: blob.size,
    caption: caption.trim() || null, captured_at: capturedAt.toISOString(),
  })
  if (ins.error && ins.error.code !== '23505') throw new Error(ins.error.message) // 23505 = retry of same client_id

  const row = await supabase.from('photos').select('id').eq('client_id', clientId).single()
  if (row.error) throw new Error(row.error.message)

  await putObject(path, blob, session.access_token, onProgress)
  const done = await supabase.rpc('confirm_photo_upload', { p_photo_id: row.data.id })
  if (done.error) throw new Error(done.error.message)
}

export async function deletePhoto(p: Photo): Promise<void> {
  const rm = await supabase.storage.from('photos').remove([p.storage_path])
  if (rm.error) throw new Error(rm.error.message)
  const del = await supabase.from('photos').delete().eq('id', p.id)
  if (del.error) throw new Error(del.error.message)
}

export async function loadDay(localDay: string): Promise<(Photo & { url: string })[]> {
  const { data, error } = await supabase.from('photos')
    .select('id, storage_path, caption, captured_at, status')
    .eq('local_date', localDay).eq('status', 'uploaded').order('captured_at')
  if (error) throw new Error(error.message)
  if (!data.length) return []
  const signed = await supabase.storage.from('photos').createSignedUrls(data.map((p) => p.storage_path), 3600)
  if (signed.error) throw new Error(signed.error.message)
  return data.map((p, i) => ({ ...(p as Photo), url: signed.data[i].signedUrl ?? "" }))
}

// Downscale so phone photos stay well under the 10 MB cap.
export async function toJpeg(file: Blob, maxSide = 2048): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * k)
  c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not process image.'))), 'image/jpeg', 0.88))
}
