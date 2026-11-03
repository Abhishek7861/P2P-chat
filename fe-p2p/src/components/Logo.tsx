// Two overlapping speech bubbles: two peers talking directly. Same artwork as public/favicon.svg.
export default function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path fill="#3d8bff" d="M11.5 4.5a9 9 0 0 0-7.7 13.7L2.5 23l5-1.6A9 9 0 1 0 11.5 4.5z" />
      <path fill="#6e3ff3" d="M20.5 8.5a9 9 0 1 1-4.1 17l-5 1.6 1.4-4.9a9 9 0 0 1 7.7-13.7z" />
      <circle cx="20.5" cy="17.5" r="4" fill="none" stroke="#fff" strokeWidth="2.2" />
      <circle cx="11.5" cy="13.5" r="2.2" fill="#fff" />
    </svg>
  );
}
