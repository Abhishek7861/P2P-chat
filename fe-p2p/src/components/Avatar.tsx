import type { User } from '../services/api';

const COLORS = ['#6e3ff3', '#ec4899', '#06b6d4', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6'];

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toUpperCase();
}

// Same user, same colour, on every screen and for every viewer
function colorFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

type Props = { user: User; size?: number; online?: boolean };

/** Initials on a colour picked from the user id; `online` adds the green presence dot. */
export default function Avatar({ user, size = 44, online }: Props) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: colorFor(user.id) }}
    >
      {initials(user.displayName)}
      {online && <span className="avatar-dot" />}
    </span>
  );
}
