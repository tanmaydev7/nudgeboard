import { useEffect, useState } from 'react';
import { formatCountdown } from '../shared/protocol';

export const useCountdown = (expiresAt: number | null | undefined): string => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expiresAt) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) {
    return '00:00';
  }
  return formatCountdown(expiresAt - now);
};
