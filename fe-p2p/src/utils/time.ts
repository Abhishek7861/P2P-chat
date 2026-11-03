const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (ms: number) => new Date(new Date(ms).toDateString()).getTime();

/** 02:40 PM */
export const clock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Today, Yesterday, a weekday within the last week, else a date. Used for day separators. */
export function dayLabel(ms: number) {
  const days = Math.round((startOfDay(Date.now()) - startOfDay(ms)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Date(ms).toLocaleDateString([], { weekday: 'long' });
  return new Date(ms).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The time for today, otherwise the day label. Used in the chat list. */
export const listTime = (ms: number) => (startOfDay(ms) === startOfDay(Date.now()) ? clock(ms) : dayLabel(ms));

export const sameDay = (a: number, b: number) => startOfDay(a) === startOfDay(b);
