"use client"
// The receipt photo, prepared in the browser before it goes anywhere: decoded with its EXIF orientation applied,
// scaled so the long edge is at most 1600 px, re-encoded as JPEG (which also drops the photo's metadata, GPS
// included) and kept under ~1.2 MB by stepping the quality down. Nothing is cached or stored: the bytes live in
// this call's memory and the request body only.

export const RECEIPT_MAX_EDGE = 1600
export const RECEIPT_TARGET_BYTES = 1_200_000
const QUALITIES = [0.85, 0.72, 0.6, 0.5]

export class ReceiptImageError extends Error {
  constructor(readonly kind: "open" | "too_large") {
    super(`receipt image: ${kind}`)
  }
}

/** Scale (w, h) so the longer edge is ≤ max; never upscales; whole pixels, at least 1. */
export function fitWithin(w: number, h: number, max = RECEIPT_MAX_EDGE): { width: number; height: number } {
  const long = Math.max(w, h)
  const k = long > max ? max / long : 1
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) }
}

export interface PreparedImage {
  base64: string
  mime: "image/jpeg"
  bytes: number
  width: number
  height: number
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" })
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() }
    } catch {
      /* fall through to <img> (older Safari) */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = "async"
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new ReceiptImageError("open")
  }
}

const toBlob = (canvas: HTMLCanvasElement, q: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", q))

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer())
  let bin = ""
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** File from the camera or the picker → a downscaled JPEG as base64 (no data: prefix). */
export async function prepareReceiptImage(file: Blob): Promise<PreparedImage> {
  if (file.type && !file.type.startsWith("image/")) throw new ReceiptImageError("open")
  const img = await decode(file)
  try {
    if (!img.width || !img.height) throw new ReceiptImageError("open")
    const { width, height } = fitWithin(img.width, img.height)
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new ReceiptImageError("open")
    ctx.fillStyle = "#fff" // transparent PNGs read better on white
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img.source, 0, 0, width, height)
    for (const q of QUALITIES) {
      const blob = await toBlob(canvas, q)
      if (!blob) throw new ReceiptImageError("open")
      if (blob.size <= RECEIPT_TARGET_BYTES) {
        const base64 = await blobToBase64(blob)
        canvas.width = canvas.height = 0 // let the pixels go now
        return { base64, mime: "image/jpeg", bytes: blob.size, width, height }
      }
    }
    throw new ReceiptImageError("too_large")
  } finally {
    img.close()
  }
}
