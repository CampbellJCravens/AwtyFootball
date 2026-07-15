import { useState } from 'react';
import { updatePlayer } from '../api/players';

interface Props {
  playerId: string;
  onSaved: () => void;
}

/**
 * Shown on your own profile when your player has no WhatsApp number linked.
 * Lets you add it yourself so your poll votes count. The number is never
 * displayed anywhere; the backend assumes +1 (US) for 10-digit entries.
 */
export default function ProfilePhoneBanner({ playerId, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      setError('Enter your 10-digit mobile number');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updatePlayer(playerId, { phone });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your number');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 p-3">
      <div className="flex items-start gap-2">
        <svg className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary">Link your WhatsApp number</p>
          <p className="text-xs text-text-secondary mt-0.5">
            Add your mobile number so your votes in the WhatsApp poll show up as you. It's private, never shown to anyone.
          </p>

          {open ? (
            <div className="mt-2">
              <div className="flex gap-2">
                <input
                  type="tel"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                  placeholder="(832) 867-3433"
                  className="flex-1 min-w-0 px-3 py-2 border border-border-emphasis rounded-lg text-sm bg-surface text-text-primary outline-none focus:ring-2 focus:ring-accent"
                />
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-3 py-2 bg-gold text-text-on-accent text-sm font-bold rounded-lg hover:bg-gold-hover disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
              <p className="text-[11px] text-text-tertiary mt-1">US number — no need for a country code.</p>
              {error && <p className="text-[11px] text-error mt-1">{error}</p>}
            </div>
          ) : (
            <button
              onClick={() => setOpen(true)}
              className="mt-2 text-xs font-semibold text-gold px-3 py-1.5 rounded-lg bg-gold/15 border border-gold/30 hover:bg-gold/25 transition-colors"
            >
              Add my number
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
