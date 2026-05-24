import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AffiliateRoute } from './components/routes/AffiliateRoute';
import { ManagerRoute } from './components/routes/ManagerRoute';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { ManagerLogin } from './components/ManagerLogin';
import { Manager } from './components/Manager';
import { ResetPassword } from './components/ResetPassword';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AffiliateRoute><Login /></AffiliateRoute>,
  },
  {
    path: '/reset-password',
    element: <ResetPassword />,
  },
  {
    path: '/dashboard',
    element: <AffiliateRoute requireAuth><Dashboard /></AffiliateRoute>,
  },
  {
    path: '/manage',
    element: <ManagerRoute><ManagerLogin /></ManagerRoute>,
  },
  {
    path: '/manage/dashboard',
    element: <ManagerRoute requireAuth><Manager /></ManagerRoute>,
  },
]);
