import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ManagerLogin } from '../ManagerLogin';
import { Manager } from '../Manager';

interface ManagerRouteProps {
  children?: ReactNode;
  requireAuth?: boolean;
}

export function ManagerRoute({ children, requireAuth }: ManagerRouteProps) {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [managerEmail, setManagerEmail] = useState('');
  const [managerName, setManagerName] = useState('');
  const [sessionToken, setSessionToken] = useState('');

  useEffect(() => {
    const token = sessionStorage.getItem('managerSessionToken');
    const email = sessionStorage.getItem('managerEmail');
    const name = sessionStorage.getItem('managerName');

    if (token && email) {
      setSessionToken(token);
      setManagerEmail(email);
      setManagerName(name || 'Manager');
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = (email: string, token: string, name: string) => {
    sessionStorage.setItem('managerSessionToken', token);
    sessionStorage.setItem('managerEmail', email);
    sessionStorage.setItem('managerName', name);
    setManagerEmail(email);
    setSessionToken(token);
    setManagerName(name);
    setIsAuthenticated(true);
    navigate('/manage/dashboard');
  };

  const handleLogout = () => {
    sessionStorage.removeItem('managerSessionToken');
    sessionStorage.removeItem('managerEmail');
    sessionStorage.removeItem('managerName');
    setIsAuthenticated(false);
    setManagerEmail('');
    setSessionToken('');
    setManagerName('');
    navigate('/manage');
  };

  const handleLoginAsUser = (email: string, accessToken: string) => {
    // Store affiliate credentials in sessionStorage (same as regular login)
    sessionStorage.setItem('userEmail', email);
    sessionStorage.setItem('accessToken', accessToken);
    // Navigate to affiliate dashboard
    navigate('/dashboard');
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
    return <Navigate to="/manage" replace />;
  }

  // If user is authenticated but trying to access login page, redirect to dashboard
  if (!requireAuth && isAuthenticated) {
    return <Navigate to="/manage/dashboard" replace />;
  }

  // Render the appropriate component based on authentication state
  if (requireAuth && isAuthenticated) {
    return (
      <Manager
        sessionToken={sessionToken}
        managerName={managerName}
        onLogout={handleLogout}
        onLoginAsUser={handleLoginAsUser}
      />
    );
  }

  return <ManagerLogin onLogin={handleLogin} />;
}
