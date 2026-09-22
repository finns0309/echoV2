// echo's mark, as in the app icon: a dot and its two fading echoes.
export function Mark() {
  return (
    <svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="18" cy="32" r="5.5" fill="var(--accent)" />
      <path d="M28 17 A19 19 0 0 1 28 47" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" />
      <path d="M40 9 A31 31 0 0 1 40 55" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" opacity="0.38" />
    </svg>
  )
}
