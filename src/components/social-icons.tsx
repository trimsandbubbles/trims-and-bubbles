// lucide-react no longer ships trademarked brand/social glyphs — small inline
// SVGs here instead of pulling in a whole extra icon package for two icons.
export function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

export function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

// TikTok's logo is a solid glyph (not a stroked outline like the two above), so
// it's a filled path — lucide-react ships no TikTok mark.
export function TiktokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M16.5 3c.32 2.34 1.63 3.74 3.9 3.89v2.63c-1.32.13-2.47-.3-3.81-1.11v4.92c0 6.25-6.82 8.2-9.56 3.72-1.76-2.89-.68-7.95 5-8.16v2.77c-.43.07-.89.18-1.31.32-1.26.43-1.97 1.23-1.77 2.63.38 2.69 5.34 3.49 4.93-1.77V3.01h2.62z" />
    </svg>
  );
}

// This lucide-react build doesn't export a YouTube glyph, so it's an inline SVG
// here too — same stroked style and sizing as the Instagram/Facebook icons.
export function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  );
}
