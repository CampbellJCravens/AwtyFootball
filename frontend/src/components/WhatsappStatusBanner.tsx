import { useEffect, useState } from 'react';
import { getWhatsappStatus } from '../api/whatsapp';

interface Props {
  onOpenSync: () => void;
}

/**
 * Admin-only warning shown at the top of the app whenever the WhatsApp listener
 * is enabled but not connected — so a silent disconnect (which stops vote
 * capture) is obvious the moment an admin opens the app. Polls periodically.
 */
export default function WhatsappStatusBanner({ onOpenSync }: Props) {
  const [down, setDown] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const s = await getWhatsappStatus();
        if (!cancelled) setDown(!!s.enabled && !s.linked);
      } catch {
        // Not admin / not signed in → don't show anything.
        if (!cancelled) setDown(false);
      }
    };
    check();
    const id = setInterval(check, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!down) return null;

  return (
    <button
      onClick={onOpenSync}
      className="w-full flex items-center gap-2 px-4 py-2 bg-error-bg border-b border-error-border text-error text-sm font-medium text-left"
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86l-8.48 14.7A1 1 0 002.68 20h18.64a1 1 0 00.87-1.44l-8.48-14.7a1 1 0 00-1.72 0z" />
      </svg>
      <span className="flex-1">WhatsApp listener disconnected — votes aren't being captured. Tap to re-link.</span>
    </button>
  );
}
