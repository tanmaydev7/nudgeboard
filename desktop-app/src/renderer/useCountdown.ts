import { useEffect, useState } from 'react';
import { formatCountdown } from '../shared/protocol';

export const useCountdown = (expiresAt: number | null | undefined) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expiresAt) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) {
    return { remaining: formatCountdown(0), expired: false };
  }
  const ms = expiresAt - now;
  return { remaining: formatCountdown(ms), expired: ms <= 0 };
};
