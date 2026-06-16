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
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center">
      <div className="max-w-md w-full mx-auto px-4">
        {/* Wordmark */}
        <div className="flex items-center gap-2 justify-center mb-8">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-blue-600">
            <path d="M13 2L4.5 13.5H11L10 22L20.5 9.5H14L13 2Z" fill="currentColor"/>
          </svg>
          <span className="text-xl font-semibold text-gray-900">Affiliate Portal</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {isForgotPassword ? 'Reset password' : (isSignup ? 'Create account' : 'Sign in')}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {isForgotPassword
              ? 'Enter your email and we’ll send you a reset link.'
              : (isSignup
                ? 'Create your partner account to get started.'
                : 'Welcome back. Sign in to your partner dashboard.')}
          </p>

          {error && (
            <div className={`mb-5 p-3 rounded-lg text-sm ${error.includes('created') || error.includes('successful') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {error}
            </div>
          )}

          {isForgotPassword ? (
            <form onSubmit={handlePasswordReset} className="space-y-5">
              <div>
                <label htmlFor="resetEmail" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email Address
                </label>
                <input
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="you@example.com"
                  required
                />
                <p className="text-xs text-gray-500 mt-1.5">
                  We'll send you a link to reset your password
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
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
                  className="text-sm text-blue-600 hover:underline"
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
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1.5">
                  Full Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="John Doe"
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                placeholder="partner@example.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  placeholder="Enter your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
                  className="text-xs text-blue-600 hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? 'Please wait…' : (isSignup ? 'Create Account' : 'Sign In')}
              </button>
            </form>
            </>
          )}
        </div>

        <p className="text-center mt-4 text-sm text-gray-500">
          {isSignup ? 'Already have an account?' : 'New partner?'}{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setIsSignup(!isSignup);
              setIsForgotPassword(false);
              setError('');
            }}
            className="text-blue-600 hover:underline"
          >
            {isSignup ? 'Sign in →' : 'Request access →'}
          </a>
        </p>
      </div>
    </div>
  );
}
