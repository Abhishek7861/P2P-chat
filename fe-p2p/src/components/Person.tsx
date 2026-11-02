import type { User } from '../services/api';

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0])
    .join('')
    .toUpperCase();
}

export default function Person({ user }: { user: User }) {
  return (
    <>
      <span className="avatar" aria-hidden="true">
        {initials(user.displayName)}
      </span>
      <span className="person-text">
        <strong>{user.displayName}</strong>
        <span>@{user.username}</span>
      </span>
    </>
  );
}
