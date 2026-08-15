import { useEffect, useState } from 'react';
import { formatCountdown } from './protocol';

export function useCountdown(expiresAt: number | null | undefined): string {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!expiresAt) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (!expiresAt) {
    return '00:00';
  }
  return formatCountdown(expiresAt - now);
}
