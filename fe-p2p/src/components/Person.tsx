import type { User } from '../services/api';
import Avatar from './Avatar';

// Avatar plus display name and @username, used in search results.
export default function Person({ user, online }: { user: User; online?: boolean }) {
  return (
    <>
      <Avatar user={user} online={online} />
      <span className="person-text">
        <strong>{user.displayName}</strong>
        <span>@{user.username}</span>
      </span>
    </>
  );
}
