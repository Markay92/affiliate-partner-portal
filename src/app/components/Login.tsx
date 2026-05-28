import { useState, useEffect } from 'react';
import { Eye, EyeOff, CreditCard } from 'lucide-react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface LoginProps {
  onLogin: (email: string, accessToken: string) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorTimeout, setErrorTimeout] = useState<NodeJS.Timeout | null>(null);

  const setErrorWithTimeout = (msg: string, duration: number = 8000) => {
    if (errorTimeout) {
      clearTimeout(errorTimeout);
    }
    setError(msg);
    const timeout = setTimeout(() => {
      setError('');
    }, duration);
    setErrorTimeout(timeout);
  };

  useEffect(() => {
    return () => {
      if (errorTimeout) {
        clearTimeout(errorTimeout);
      }
    };
  }, [errorTimeout]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isSignup ? 'signup' : 'login';
      const body = isSignup ? { email, password, name } : { email, password };
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/${endpoint}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${publicAnonKey}`
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      if (isSignup) {
        setIsSignup(false);
        setErrorWithTimeout('Account created! Please sign in.', 6000);
        setPassword('');
      } else {
        onLogin(email, data.session.access_token);
      }
    } catch (err) {
      const errorMsg = err.message === 'Failed to fetch'
        ? 'Cannot connect to server. Please make sure the Supabase edge function is deployed.'
        : err.message;
      setErrorWithTimeout(errorMsg, 8000);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Get the current origin to build the redirect URL
      const redirectUrl = `${window.location.origin}/reset-password`;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8dc4138c/send-password-reset`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            email: resetEmail,
            redirectUrl
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send reset link');
      }

      setErrorWithTimeout('Password reset link sent! Check your email to continue.', 8000);
      setIsForgotPassword(false);
      setResetEmail('');
    } catch (err) {
      setErrorWithTimeout(err.message, 8000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        {/* Logo mark above card */}
        <div className="flex justify-center mb-8">
          <div className="bg-indigo-500 p-3 rounded-2xl shadow-lg shadow-indigo-500/30">
            <CreditCard className="w-7 h-7 text-white" />
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8 ring-1 ring-white/10">
          <h1 className="text-center text-xl font-semibold text-slate-900 mb-1">Affiliate Partner Portal</h1>
          <p className="text-center text-sm text-slate-500 mb-7">
            {isForgotPassword ? 'Reset your password' : (isSignup ? 'Create your account' : 'Sign in to your dashboard')}
          </p>

          {error && (
            <div className={`mb-5 p-3 rounded-xl text-sm ${error.includes('created') || error.includes('successful') ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60' : 'bg-red-50 text-red-700 ring-1 ring-red-200/60'}`}>
              {error}
            </div>
          )}

          {isForgotPassword ? (
            <form onSubmit={handlePasswordReset} className="space-y-5">
              <div>
                <label htmlFor="resetEmail" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Email Address
                </label>
                <input
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm"
                  placeholder="you@example.com"
                  required
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  We'll send you a link to reset your password
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setError('');
                    setResetEmail('');
                  }}
                  className="text-sm text-indigo-600 hover:text-indigo-700"
                >
                  Back to sign in
                </button>
              </div>
            </form>
          ) : (
            <>
            <form onSubmit={handleSubmit} className="space-y-5">
            {isSignup && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-sm"
                  placeholder="John Doe"
                  required
                />
              </div>
            )}

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
                placeholder="partner@example.com"
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

            {!isSignup && (
              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setError('');
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  Forgot password?
                </button>
              </div>
            )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {loading ? 'Please wait…' : (isSignup ? 'Create Account' : 'Sign In')}
              </button>
            </form>

            <div className="mt-5 text-center">
              <button
                onClick={() => {
                  setIsSignup(!isSignup);
                  setIsForgotPassword(false);
                  setError('');
                }}
                className="text-sm text-indigo-600 hover:text-indigo-700"
              >
                {isSignup ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
              </button>
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
