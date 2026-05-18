import { FormEvent, useState } from 'react';

export const PASSWORD_STORAGE_KEY = 'awtyAccess';
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

interface PasswordGateProps {
  onUnlock: () => void;
}

// Casual gate. The password lives server-side (env var); we POST it to the
// backend rather than comparing locally so it doesn't ship in the JS bundle.
export default function PasswordGate({ onUnlock }: PasswordGateProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/site-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input.trim() }),
      });
      if (res.ok) {
        try { localStorage.setItem(PASSWORD_STORAGE_KEY, 'granted'); } catch { /* ignore */ }
        onUnlock();
      } else if (res.status === 401) {
        setError('Wrong password');
        setInput('');
      } else {
        setError('Something went wrong, try again');
      }
    } catch {
      setError('Could not reach the server');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-base flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-modal max-w-sm w-full p-6 border border-border">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gold italic">Awty Football</h1>
          <p className="text-text-tertiary text-sm mt-2">Enter the password to continue</p>
          <p className="text-text-tertiary text-xs mt-2">Text Campbell or message the WhatsApp group to get the password</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null); }}
            placeholder="Password"
            autoFocus
            autoComplete="off"
            className="w-full px-4 py-3 bg-surface-raised border border-border-emphasis rounded-xl text-text-primary text-center tracking-widest outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
          {error && (
            <p className="text-error text-sm text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={!input.trim() || submitting}
            className="w-full px-4 py-3 bg-gold text-text-on-accent font-semibold rounded-xl hover:bg-gold-hover active:bg-gold-active disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Checking…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  );
}
