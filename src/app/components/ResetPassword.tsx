import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, CreditCard } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '/utils/supabase/info';

export function ResetPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [validToken, setValidToken] = useState(false);
  const [checkingToken, setCheckingToken] = useState(true);

  useEffect(() => {
    // Check if there's a valid session from the email link
    const checkSession = async () => {
      try {
        const supabase = createClient(
          `https://${projectId}.supabase.co`,
          publicAnonKey
        );

        // Supabase automatically handles the hash fragment from the email link
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          setError('Invalid or expired reset link. Please request a new one.');
          setValidToken(false);
        } else {
          setValidToken(true);
        }
      } catch (err) {
        console.error('Session check error:', err);
        setError('Failed to verify reset link.');
        setValidToken(false);
      } finally {
        setCheckingToken(false);
      }
    };

    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient(
        `https://${projectId}.supabase.co`,
        publicAnonKey
      );

      // Update the user's password
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw new Error(error.message);
      }

      setSuccess('Password updated successfully! Redirecting to login...');

      // Sign out and redirect to login after 2 seconds
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate('/');
      }, 2000);
    } catch (err) {
      console.error('Password reset error:', err);
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (checkingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-soft to-brand-soft px-4">
        <div className="text-center">
          <p className="text-subtle">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (!validToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-soft to-brand-soft px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex justify-center mb-6">
              <div className="bg-red-600 p-3 rounded-full">
                <CreditCard className="w-8 h-8 text-white" />
              </div>
            </div>

            <h1 className="text-center mb-2">Invalid Reset Link</h1>
            <p className="text-center text-subtle mb-6">
              {error || 'This password reset link is invalid or has expired.'}
            </p>

            <button
              onClick={() => navigate('/')}
              className="w-full bg-brand text-white py-3 rounded-lg hover:bg-brand-dark transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-soft to-brand-soft px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="flex justify-center mb-6">
            <div className="bg-brand p-3 rounded-full">
              <CreditCard className="w-8 h-8 text-white" />
            </div>
          </div>

          <h1 className="text-center mb-2">Set New Password</h1>
          <p className="text-center text-subtle mb-8">
            Enter your new password below
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-800">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 text-green-800">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="newPassword" className="block mb-2 text-subtle">
                New Password
              </label>
              <div className="relative">
                <input
                  id="newPassword"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-faint2 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent pr-12"
                  placeholder="Enter new password"
                  required
                  disabled={loading || !!success}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-subtle"
                  disabled={loading || !!success}
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block mb-2 text-subtle">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-faint2 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent pr-12"
                  placeholder="Confirm new password"
                  required
                  disabled={loading || !!success}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-subtle"
                  disabled={loading || !!success}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !!success}
              className="w-full bg-brand text-white py-3 rounded-lg hover:bg-brand-dark transition-colors disabled:opacity-50"
            >
              {loading ? 'Updating...' : success ? 'Redirecting...' : 'Update Password'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/')}
              className="text-brand hover:text-brand-dark"
              disabled={loading}
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
