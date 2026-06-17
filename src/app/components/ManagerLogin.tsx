import { useState, useEffect } from 'react';
import { Eye, EyeOff, Shield } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface ManagerLoginProps {
  onLogin: (email: string, sessionToken: string, name: string) => void;
}

export function ManagerLogin({ onLogin }: ManagerLoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorTimeout, setErrorTimeout] = useState<NodeJS.Timeout | null>(null);

  const setErrorWithTimeout = (msg: string, duration: number = 8000) => {
    if (errorTimeout) clearTimeout(errorTimeout);
    setError(msg);
    const timeout = setTimeout(() => setError(''), duration);
    setErrorTimeout(timeout);
  };

  useEffect(() => {
    return () => { if (errorTimeout) clearTimeout(errorTimeout); };
  }, [errorTimeout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/manager/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${publicAnonKey}` },
          body: JSON.stringify({ email, password })
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Manager login failed');
      onLogin(data.manager.email, data.sessionToken, data.manager.name);
    } catch (err) {
      setErrorWithTimeout(err.message || 'Connection failed', 8000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-[360px]">
        <div className="flex items-center gap-2.5 mb-12">
          <span className="font-bold text-[17px] tracking-tight text-ink">Manager Portal</span>
        </div>

        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.03em] text-ink mb-2">Sign in</h1>
          <p className="text-[15px] text-subtle leading-relaxed mb-8">Manage affiliates, payouts, and CPA rates.</p>

          {error && (
            <div className="mb-5 p-3 rounded-xl text-sm bg-red-50 text-red-700 ring-1 ring-red-200/60">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-[18px]">
            <div>
              <label htmlFor="email" className="block text-[13px] font-semibold text-ink mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-line bg-white text-[15px] text-ink outline-none transition focus:border-brand focus:ring-[3px] focus:ring-brand/15"
                placeholder="manager@example.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[13px] font-semibold text-ink mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-12 pl-4 pr-12 rounded-xl border border-line bg-white text-[15px] text-ink outline-none transition focus:border-brand focus:ring-[3px] focus:ring-brand/15"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-subtle"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-[50px] bg-brand text-white rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50 text-[15px] font-bold"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {/* Subtle visual cue that this is the manager portal */}
          <div className="mt-7 flex items-center justify-center gap-2 text-xs text-faint">
            <Shield className="w-3.5 h-3.5" />
            Manager access only
          </div>
        </div>
      </div>
    </div>
  );
}
