import "server-only";

import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

/**
 * Reusable safe-image pipeline.
 *
 * Shared by every feature that accepts user-uploaded images (appointment
 * photos today; product photos and gallery photos next). The golden rules:
 *
 *   1. NEVER trust the client. The browser-supplied MIME type and filename
 *      extension are attacker-controlled and are ignored entirely. We sniff
 *      the real magic bytes and let `sharp` decide whether the bytes are a
 *      decodable image.
 *   2. We ALWAYS re-encode through sharp. This strips every scrap of
 *      metadata — including EXIF GPS tags. This is a home-based business, so
 *      leaking the owner's home coordinates in a public photo is a real
 *      privacy risk, not a hypothetical one.
 *   3. The stored extension and content type are chosen by the SERVER, never
 *      derived from the upload. That's what stops the stored-XSS vector where
 *      an "image/svg+xml" or "image/html" body is served same-origin and
 *      executed in the victim's browser.
 */

/** Formats we accept. Anything else (SVG, HTML, GIF, PDF, ...) is rejected. */
type OutputExt = "jpg" | "webp";

export interface ProcessedImage {
  buffer: Buffer;
  ext: OutputExt;
  contentType: string;
}

/** Reject anything larger than this before we even hand it to sharp. */
const MAX_INPUT_BYTES = 12 * 1024 * 1024; // 12MB

/** Longest edge of the stored image. We downscale to this but never enlarge. */
const MAX_EDGE_PX = 2000;

/** A single, friendly error the callers can surface to users verbatim. */
export class InvalidImageError extends Error {
  constructor(message = "That file doesn't look like a photo — please upload a JPG, PNG or WebP image.") {
    super(message);
    this.name = "InvalidImageError";
  }
}

function toBuffer(bytes: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  // Uint8Array (respect any byteOffset/length of the view).
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/**
 * Sniff the ACTUAL container from the leading bytes. We do not trust — and do
 * not even look at — any client-supplied MIME type or filename here.
 * Returns the detected format, or null if it is not one we accept.
 */
function sniffImageFormat(buf: Buffer): "jpeg" | "png" | "webp" | null {
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

/**
 * Validate + normalize an untrusted upload into a safe, re-encoded image.
 *
 * Throws {@link InvalidImageError} for anything that is not a real JPEG/PNG/WebP,
 * is too large, or that sharp cannot actually decode (a file that lies in its
 * magic bytes but is not a genuine image is rejected here, never written).
 *
 *  - JPEG / PNG  -> re-encoded to JPEG  ("jpg", image/jpeg)
 *  - WebP        -> re-encoded to WebP  ("webp", image/webp)
 *
 * EXIF (incl. GPS) and all other metadata are dropped, because we re-encode and
 * do NOT call sharp's `.withMetadata()`. Orientation is applied first via
 * `.rotate()` so the pixels look right after the tags are gone.
 */
export async function validateAndProcessImage(
  bytes: Buffer | ArrayBuffer | Uint8Array,
): Promise<ProcessedImage> {
  const input = toBuffer(bytes);

  if (input.length === 0) {
    throw new InvalidImageError();
  }
  if (input.length > MAX_INPUT_BYTES) {
    throw new InvalidImageError("That image is too large — please upload a photo under 12MB.");
  }

  const detected = sniffImageFormat(input);
  if (!detected) {
    // Not a real JPEG/PNG/WebP by its bytes (SVG, HTML, GIF, PDF, ...).
    throw new InvalidImageError();
  }

  const keepWebp = detected === "webp";

  try {
    // `.rotate()` with no args bakes in the EXIF orientation BEFORE we strip
    // metadata; `failOn: "error"` makes sharp reject truncated/corrupt data.
    const pipeline = sharp(input, { failOn: "error" })
      .rotate()
      .resize({
        width: MAX_EDGE_PX,
        height: MAX_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      });

    // Re-encoding with a server-chosen encoder is what strips metadata (we
    // never call `.withMetadata()`) and neutralizes any script payload.
    if (keepWebp) {
      const buffer = await pipeline.webp({ quality: 82 }).toBuffer();
      return { buffer, ext: "webp", contentType: "image/webp" };
    }

    const buffer = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
    return { buffer, ext: "jpg", contentType: "image/jpeg" };
  } catch {
    // Magic bytes matched but sharp could not decode it — treat as invalid.
    throw new InvalidImageError();
  }
}

/* -------------------------------------------------------------------------- */
/*  Storage abstraction                                                       */
/* -------------------------------------------------------------------------- */
/*
 * SINGLE SWAP POINT for cloud storage.
 *
 * Right now images are written to `public/uploads/...` on local disk, which
 * Next.js serves directly as static files. That is fine for dev and for the
 * owner-review preview, but note: local disk is EPHEMERAL on serverless
 * (Vercel) — the filesystem is read-only/reset between deploys and instances,
 * so uploads written this way will NOT persist in production.
 *
 * To move to Vercel Blob / S3, change ONLY `saveImage` and `deleteImage`
 * below (e.g. `put(key, processed.buffer, ...)` and return the blob URL). The
 * rest of the app just consumes the returned public URL string, so nothing
 * else has to change.
 */

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

/** Only allow simple, single-segment subdir names (e.g. "appointments"). */
function safeSubdir(subdir: string): string {
  const clean = subdir.replace(/[^a-z0-9_-]/gi, "");
  if (!clean) throw new Error("saveImage: invalid subdir");
  return clean;
}

/**
 * Persist a processed image and return its public URL path
 * (`/uploads/<subdir>/<uuid>.<ext>`). The filename is a random UUID with the
 * SERVER-chosen extension — never anything from the client.
 */
export async function saveImage(processed: ProcessedImage, subdir: string): Promise<string> {
  const dirName = safeSubdir(subdir);
  const filename = `${randomUUID()}.${processed.ext}`;

  // PRODUCTION (serverless, e.g. Vercel): store in Vercel Blob so uploads
  // persist across deploys and instances. Activated automatically when
  // BLOB_READ_WRITE_TOKEN is set in the environment. Returns an absolute
  // https URL on the Blob CDN (allowed by next.config remotePatterns + CSP).
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${dirName}/${filename}`, processed.buffer, {
      access: "public",
      contentType: processed.contentType,
    });
    return blob.url;
  }

  // LOCAL / DEV fallback: write to public/uploads (NOT persistent on serverless).
  const dir = path.join(UPLOADS_ROOT, dirName);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), processed.buffer);
  return `/uploads/${dirName}/${filename}`;
}

/**
 * Best-effort delete of a previously-saved image, given its public URL path
 * (the string `saveImage` returned). Used by later delete flows; silently
 * ignores anything outside the uploads root or already-missing files.
 */
export async function deleteImage(publicPath: string): Promise<void> {
  // Vercel Blob URL (absolute https) — delete through the Blob API.
  if (/^https?:\/\//i.test(publicPath)) {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { del } = await import("@vercel/blob");
        await del(publicPath);
      } catch {
        // Best-effort — already gone or transient error.
      }
    }
    return;
  }

  if (!publicPath.startsWith("/uploads/")) return;

  const relative = publicPath.slice("/uploads/".length);
  const target = path.join(UPLOADS_ROOT, relative);

  // Guard against path traversal — never unlink outside the uploads root.
  const normalizedRoot = path.resolve(UPLOADS_ROOT);
  const normalizedTarget = path.resolve(target);
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(normalizedRoot + path.sep)) {
    return;
  }

  try {
    await unlink(normalizedTarget);
  } catch {
    // Best-effort: already gone or never existed. Nothing to do.
  }
}
