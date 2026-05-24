import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Login } from '../Login';
import { Dashboard } from '../Dashboard';

interface AffiliateRouteProps {
  children?: ReactNode;
  requireAuth?: boolean;
}

export function AffiliateRoute({ children, requireAuth }: AffiliateRouteProps) {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    // Check sessionStorage first (regular login and impersonation)
    let token = sessionStorage.getItem('accessToken');
    let email = sessionStorage.getItem('userEmail');

    // Fallback to localStorage for backwards compatibility
    if (!token || !email) {
      token = localStorage.getItem('accessToken');
      email = localStorage.getItem('email');

      // If found in localStorage, migrate to sessionStorage
      if (token && email) {
        sessionStorage.setItem('accessToken', token);
        sessionStorage.setItem('userEmail', email);
      }
    }

    if (token && email) {
      setAccessToken(token);
      setUserEmail(email);
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = (email: string, token: string) => {
    sessionStorage.setItem('accessToken', token);
    sessionStorage.setItem('userEmail', email);
    setUserEmail(email);
    setAccessToken(token);
    setIsAuthenticated(true);
    navigate('/dashboard');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('userEmail');
    setIsAuthenticated(false);
    setUserEmail('');
    setAccessToken('');
    navigate('/');
  };

  if (loading) {
    return (
      <div className="size-full flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  // If this route requires auth but user is not authenticated, redirect to login
  if (requireAuth && !isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // If user is authenticated but trying to access login page, redirect to dashboard
  if (!requireAuth && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  // Render the appropriate component based on authentication state
  if (requireAuth && isAuthenticated) {
    return <Dashboard userEmail={userEmail} accessToken={accessToken} onLogout={handleLogout} />;
  }

  return <Login onLogin={handleLogin} />;
}
