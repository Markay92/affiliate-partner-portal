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
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        {/* Shield icon — distinguishes from affiliate login */}
        <div className="flex justify-center mb-8">
          <div className="bg-[#4F46E5] p-3 rounded-2xl shadow-lg shadow-indigo-500/30">
            <Shield className="w-7 h-7 text-white" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 ring-1 ring-white/10">
          <h1 className="text-center text-xl font-semibold text-slate-900 mb-1">Manager Portal</h1>
          <p className="text-center text-sm text-slate-500 mb-7">Sign in to manage affiliates</p>

          {error && (
            <div className="mb-5 p-3 rounded-xl text-sm bg-red-50 text-red-700 ring-1 ring-red-200/60">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm"
                placeholder="manager@example.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 pr-11 text-sm"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm font-medium"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          {/* Subtle visual cue that this is the manager portal */}
          <div className="mt-5 px-3 py-2 bg-slate-50 rounded-lg ring-1 ring-slate-200/60">
            <p className="text-xs text-slate-400 text-center">Manager access only</p>
          </div>
        </div>
      </div>
    </div>
  );
}
