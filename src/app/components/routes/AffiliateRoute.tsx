import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Login } from '../Login';
import { Dashboard } from '../Dashboard';

interface AffiliateRouteProps {
  requireAuth?: boolean;
}

/** Read and migrate auth tokens synchronously (no async, no useEffect). */
function readAuthFromStorage(): { token: string; email: string } {
  let token = sessionStorage.getItem('accessToken') ?? '';
  let email = sessionStorage.getItem('userEmail') ?? '';

  // Fallback: migrate from localStorage (older sessions)
  if (!token || !email) {
    const lsToken = localStorage.getItem('accessToken') ?? '';
    const lsEmail = localStorage.getItem('email') ?? '';
    if (lsToken && lsEmail) {
      sessionStorage.setItem('accessToken', lsToken);
      sessionStorage.setItem('userEmail', lsEmail);
      token = lsToken;
      email = lsEmail;
    }
  }

  return { token, email };
}

export function AffiliateRoute({ requireAuth }: AffiliateRouteProps) {
  const navigate = useNavigate();

  // Lazy initialisers run synchronously on first render — no useEffect timing gap.
  // This means the component never renders in a "wrong" auth state on mount,
  // which fixes the impersonation flow (manager → login-as → /dashboard).
  const [accessToken, setAccessToken] = useState<string>(() => readAuthFromStorage().token);
  const [userEmail, setUserEmail]     = useState<string>(() => readAuthFromStorage().email);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => {
      const { token, email } = readAuthFromStorage();
      return !!(token && email);
    }
  );

  const handleLogin = (email: string, token: string) => {
    sessionStorage.setItem('accessToken', token);
    sessionStorage.setItem('userEmail', email);
    setAccessToken(token);
    setUserEmail(email);
    setIsAuthenticated(true);
    navigate('/dashboard');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('userEmail');
    setAccessToken('');
    setUserEmail('');
    setIsAuthenticated(false);
    navigate('/');
  };

  // If this route requires auth but user is not authenticated, redirect to login
  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // If user is authenticated but trying to access login page, redirect to dashboard
  if (!requireAuth && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  if (requireAuth && isAuthenticated) {
    return <Dashboard userEmail={userEmail} accessToken={accessToken} onLogout={handleLogout} />;
  }

  return <Login onLogin={handleLogin} />;
}
