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
      // Email is not case-sensitive — normalize so "John@X.com" works like "john@x.com".
      const normEmail = email.trim().toLowerCase();
      const body = isSignup ? { email: normEmail, password, name } : { email: normEmail, password };
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
            email: resetEmail.trim().toLowerCase(),
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
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-[360px]">
        <div className="flex items-center gap-2.5 mb-12">
          <span className="font-bold text-[17px] tracking-tight text-ink">Affiliate Portal</span>
        </div>

        <div>
          <h1 className="text-[30px] font-bold tracking-[-0.03em] text-ink mb-2">
            {isForgotPassword ? 'Reset password' : (isSignup ? 'Create account' : 'Sign in')}
          </h1>
          <p className="text-[15px] text-subtle leading-relaxed mb-8">
            {isForgotPassword ? 'Enter your email and we’ll send you a reset link.' : (isSignup ? 'Set up your partner dashboard access.' : 'Welcome back. Sign in to your partner dashboard.')}
          </p>

          {error && (
            <div className={`mb-5 p-3 rounded-xl text-sm ${error.includes('created') || error.includes('successful') || error.includes('sent') ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/60' : 'bg-red-50 text-red-700 ring-1 ring-red-200/60'}`}>
              {error}
            </div>
          )}

          {isForgotPassword ? (
            <form onSubmit={handlePasswordReset} className="space-y-5">
              <div>
                <label htmlFor="resetEmail" className="block text-[13px] font-semibold text-ink mb-1.5">
                  Email Address
                </label>
                <input
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-line bg-white text-[15px] text-ink outline-none transition focus:border-brand focus:ring-[3px] focus:ring-brand/15"
                  placeholder="you@example.com"
                  required
                />
                <p className="text-xs text-faint mt-1.5">
                  We'll send you a link to reset your password
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-[50px] bg-brand text-white rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50 text-[15px] font-bold"
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
                  className="text-sm font-semibold text-brand hover:text-brand-dark"
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
                <label htmlFor="name" className="block text-[13px] font-semibold text-ink mb-1.5">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-12 px-4 rounded-xl border border-line bg-white text-[15px] text-ink outline-none transition focus:border-brand focus:ring-[3px] focus:ring-brand/15"
                  placeholder="John Doe"
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-[13px] font-semibold text-ink mb-1.5">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-line bg-white text-[15px] text-ink outline-none transition focus:border-brand focus:ring-[3px] focus:ring-brand/15"
                placeholder="partner@example.com"
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

            {!isSignup && (
              <div className="flex justify-end -mt-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setError('');
                  }}
                  className="text-xs font-semibold text-brand hover:text-brand-dark"
                >
                  Forgot password?
                </button>
              </div>
            )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-[50px] bg-brand text-white rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50 text-[15px] font-bold"
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
                className="text-sm font-semibold text-brand hover:text-brand-dark"
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
