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
    <div className="min-h-screen flex items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-[360px]">
        <div className="flex items-center gap-2.5 mb-12">
          <div className="flex items-center justify-center">
            <svg width="30" height="28" viewBox="0 0 39 37" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g clipPath="url(#clip0_login_aff)">
                <mask id="mask0_login_aff" style={{maskType:'luminance'}} maskUnits="userSpaceOnUse" x="0" y="0" width="38" height="37">
                  <path d="M37.9056 0H0.00134277V36.2562H37.9056V0Z" fill="white"/>
                </mask>
                <g mask="url(#mask0_login_aff)">
                  <path d="M24.0842 35.9213C22.2347 35.9112 20.4777 35.4898 18.7902 34.7694C18.2321 34.5316 17.7163 34.2255 17.341 33.7368C17.2789 33.6557 17.2394 33.5978 17.1176 33.6894C15.9782 34.5486 14.6315 34.9737 13.292 35.4015C12.3529 35.7012 11.4003 35.9702 10.412 36.0705C9.47615 36.1657 8.59348 36.0426 7.81448 35.4587C6.98045 34.8336 6.64022 33.6487 7.05367 32.7011C7.39521 31.918 7.96484 31.2959 8.56175 30.6994C9.15085 30.1104 9.76197 29.5431 10.3646 28.9674C10.5416 28.798 10.6517 28.5954 10.6692 28.355C10.7697 26.9854 10.9168 25.6177 10.8922 24.2411C10.8915 24.1991 10.8851 24.1567 10.8818 24.1148C10.8416 23.5723 10.6796 23.4002 10.1508 23.2726C9.59471 23.1388 9.0374 23.1832 8.47815 23.2212C7.02646 23.3202 5.57547 23.4276 4.12315 23.5119C3.30789 23.5595 2.49327 23.6909 1.67282 23.5449C0.690355 23.3703 0.118116 22.7694 0.0222021 21.7926C-0.0361375 21.2004 0.0435766 20.6103 0.0708017 20.0212C0.175137 17.7308 0.302166 15.4402 0.455101 13.1523C0.571104 11.4133 0.740898 9.67757 0.883467 7.94052C0.955405 7.06722 0.984573 6.1882 1.18418 5.33015C1.61708 3.4706 2.87498 2.47228 4.72522 2.07434C6.22093 1.75257 7.7387 1.64278 9.25843 1.64595C11.3666 1.65041 13.4617 1.45937 15.5621 1.34576C16.2815 1.30641 16.9989 1.2531 17.7203 1.23406C18.6573 1.20932 19.5919 1.07985 20.5289 1.03542C22.8141 0.926894 25.0706 0.519439 27.3537 0.412817C28.4956 0.359506 29.6401 0.383615 30.7825 0.306827C31.8915 0.231941 32.999 0.148162 34.102 0.022501C35.9508 -0.187573 37.6132 1.09633 37.855 2.91147C37.9547 3.65847 37.8278 4.38959 37.7577 5.12198C37.6145 6.635 37.4428 8.14612 37.1966 9.64712C36.9911 10.8954 36.7727 12.1425 36.5471 13.3878C36.2121 15.2352 35.8887 17.0846 35.544 18.9303C35.2121 20.708 34.0593 21.4708 32.5337 21.7583C30.9933 22.0483 29.4262 22.0719 27.8702 22.2057C26.7426 22.3023 25.6071 22.3187 24.4919 22.5281C23.7686 22.6641 23.5788 22.9095 23.5781 23.6383C23.5781 25.108 23.5859 26.5779 23.5723 28.0478C23.569 28.3906 23.6831 28.657 23.906 28.9071C24.543 29.6218 25.3401 30.1543 26.0757 30.7559C26.8903 31.4216 27.5398 32.2022 27.53 33.2927C27.5144 34.9827 26.8412 35.5939 25.309 35.8496C24.9028 35.9176 24.4931 35.9246 24.0823 35.9226L24.0842 35.9213Z" fill="white"/>
                  <path d="M17.6325 28.7049C17.6325 27.4888 17.6339 26.2735 17.6306 25.0575C17.6306 24.9135 17.6098 24.7681 17.5877 24.6248C17.5561 24.4184 17.4167 24.2985 17.2145 24.2947C16.9954 24.2908 16.8516 24.4228 16.8153 24.6368C16.7939 24.7605 16.8004 24.8892 16.8023 25.0156C16.8361 27.4471 16.86 29.8777 16.9152 32.3084C16.9249 32.7388 16.7589 33.0015 16.4155 33.2193C15.5412 33.7745 14.5827 34.1421 13.6009 34.4582C12.457 34.8269 11.3106 35.1841 10.1006 35.2964C9.1318 35.386 8.2362 34.9867 7.86482 34.2759C7.60237 33.7733 7.62117 33.289 7.90504 32.7998C8.49669 31.7798 9.38199 31.0157 10.2355 30.2249C10.5491 29.9343 10.8602 29.6422 11.1363 29.3167C11.5011 28.887 11.4959 28.3559 11.5374 27.8455C11.6119 26.9203 11.6573 25.9931 11.7189 25.0663C11.7552 24.5258 11.7377 23.9907 11.5731 23.4683C11.4396 23.0451 11.1505 22.7754 10.728 22.6185C10.0877 22.3799 9.42665 22.3463 8.75463 22.3933C7.93804 22.4503 7.12153 22.5131 6.30496 22.5697C5.16566 22.6484 4.02636 22.7207 2.88706 22.8025C2.42046 22.8361 1.95775 22.8407 1.51577 22.6706C1.09905 22.5107 0.848902 22.2193 0.838535 21.7611C0.817147 20.8199 0.91306 19.8825 0.938341 18.9432C0.953896 18.3841 1.02259 17.8268 1.04203 17.2683C1.09582 15.7172 1.19886 14.1693 1.31617 12.622C1.43865 11.0024 1.55853 9.38268 1.70824 7.76561C1.77303 7.06307 1.80804 6.3573 1.94867 5.66108C2.23382 4.25024 3.05362 3.34013 4.4852 2.96568C5.73077 2.6401 7.00162 2.52332 8.28416 2.47001C9.4604 2.42116 10.6379 2.4478 11.8129 2.3964C13.2108 2.33547 14.6055 2.20029 16.002 2.10699C16.8516 2.04988 17.7031 2.02449 18.5521 1.96039C19.9473 1.85567 21.3472 1.81569 22.7392 1.66083C24.0321 1.51739 25.3276 1.40378 26.6205 1.26098C27.8033 1.13025 28.9912 1.2464 30.1759 1.14929C31.4195 1.0471 32.6688 1.00268 33.9066 0.833222C35.4666 0.619345 36.67 1.37903 37.0141 2.83558C37.1191 3.28048 37.0795 3.74314 37.0343 4.19375C36.9001 5.51575 36.7542 6.83646 36.5949 8.15531C36.4328 9.49376 36.1685 10.8171 35.939 12.1454C35.6883 13.5956 35.4375 15.0458 35.1736 16.4934C35.0176 17.3527 34.8373 18.2077 34.6675 19.0644C34.4724 20.0501 33.8076 20.5889 32.8699 20.8529C31.9859 21.1017 31.0714 21.1645 30.1603 21.2357C28.807 21.3411 27.4532 21.4381 26.1002 21.5389C25.4463 21.5878 24.7917 21.6234 24.1508 21.7865C23.1074 22.0524 22.7691 22.6584 22.7489 23.5463C22.7147 25.0683 22.7379 26.5921 22.7399 28.1146C22.7405 28.727 23.0548 29.1968 23.4663 29.6213C24.0776 30.2523 24.7988 30.7554 25.4785 31.3082C25.7022 31.4898 25.9161 31.6866 26.1111 31.8966C26.7747 32.6118 26.8687 33.4293 26.5369 34.3159C26.4313 34.5977 26.2045 34.7487 25.9369 34.856C25.43 35.059 24.8953 35.1226 24.3562 35.127C22.43 35.1434 20.5979 34.7227 18.8651 33.9122C18.3486 33.6704 17.8743 33.3443 17.7395 32.7268C17.7141 32.6106 17.7084 32.4971 17.7084 32.3821C17.707 31.1559 17.7077 29.9299 17.7077 28.703C17.6831 28.703 17.6584 28.703 17.6339 28.703L17.6325 28.7049ZM18.6416 17.514C18.7906 17.495 18.9396 17.4703 19.0894 17.4575C20.552 17.3369 21.9984 16.1501 22.3907 14.752C22.4521 14.5323 22.3809 14.3712 22.1812 14.2842C21.9836 14.1985 21.7962 14.241 21.6751 14.4333C21.6252 14.5126 21.5974 14.6053 21.5611 14.6923C21.3575 15.1778 21.0627 15.6012 20.6642 15.9533C19.9248 16.6065 19.0452 16.7867 18.0856 16.6674C16.7602 16.503 15.7395 15.933 15.2917 14.616C15.1814 14.293 14.9696 14.1636 14.7155 14.2733C14.4335 14.3953 14.4523 14.632 14.5295 14.8687C14.7266 15.4742 15.059 15.9965 15.5418 16.4244C16.4225 17.2049 17.4951 17.455 18.6416 17.514ZM18.3623 13.7149C18.7789 13.7251 19.1756 13.6438 19.5502 13.4642C20.0854 13.2072 20.3913 12.7147 20.3524 12.1689C20.3077 11.5482 19.974 11.1204 19.357 10.9523C18.6428 10.7574 17.9495 10.8145 17.3072 11.2055C16.4407 11.7329 16.4186 12.8657 17.2606 13.4223C17.5937 13.6425 17.9636 13.7314 18.3623 13.7149ZM12.4538 11.4834C12.8912 11.4879 13.2302 11.1629 13.2341 10.7339C13.238 10.3207 12.8822 9.95521 12.4719 9.95009C12.0559 9.94503 11.6936 10.2966 11.6839 10.7161C11.6742 11.1319 12.0222 11.4784 12.4545 11.4834H12.4538ZM25.4229 10.4458C25.4288 10.0161 25.1119 9.69181 24.6847 9.68865C24.2809 9.68609 23.9149 10.0383 23.9096 10.435C23.9052 10.8119 24.2577 11.1591 24.6555 11.1699C25.0859 11.182 25.4171 10.8697 25.4222 10.4458H25.4229Z" fill="#50C8FD"/>
                  <path d="M18.6405 17.514C17.4949 17.4556 16.4217 17.2056 15.5411 16.4251C15.0575 15.9966 14.7258 15.4749 14.5287 14.8695C14.4516 14.6328 14.4328 14.3961 14.7148 14.2743C14.9694 14.1644 15.1813 14.294 15.2909 14.617C15.7393 15.9337 16.7599 16.5037 18.0845 16.6681C19.0436 16.7875 19.9236 16.6071 20.6631 15.9541C21.0617 15.6019 21.3565 15.1785 21.56 14.6931C21.5963 14.6061 21.6241 14.5135 21.6741 14.4341C21.7952 14.2424 21.9825 14.1994 22.1802 14.2851C22.3797 14.372 22.451 14.5332 22.3894 14.7528C21.9973 16.1509 20.551 17.3376 19.0884 17.4582C18.9386 17.4703 18.7897 17.495 18.6405 17.514Z" fill="white"/>
                  <path d="M18.3637 13.7145C17.9645 13.7318 17.5952 13.6422 17.262 13.4214C16.4209 12.8654 16.443 11.7319 17.3086 11.2046C17.9508 10.8137 18.6443 10.7565 19.3585 10.9514C19.9753 11.1202 20.309 11.5473 20.3538 12.168C20.3928 12.7144 20.0869 13.2069 19.5514 13.4633C19.1764 13.6428 18.7804 13.7247 18.3637 13.7145ZM18.3598 12.9289C18.7304 12.9289 19.0701 12.8476 19.2845 12.7093C19.6292 12.4865 19.6455 11.9858 19.3136 11.7796C18.8724 11.5048 17.9515 11.6177 17.5919 11.9877C17.4078 12.1769 17.3961 12.3787 17.54 12.59C17.7358 12.8768 18.0306 12.9454 18.3592 12.9295L18.3598 12.9289Z" fill="white"/>
                  <path d="M12.4529 11.4837C12.0206 11.4792 11.6726 11.132 11.6823 10.7164C11.6921 10.2969 12.0543 9.94466 12.4704 9.95039C12.8812 9.95544 13.2363 10.321 13.2324 10.7341C13.2285 11.1632 12.8903 11.4881 12.4529 11.4837Z" fill="white"/>
                  <path d="M25.4228 10.446C25.4171 10.8699 25.0866 11.1822 24.6562 11.1701C24.2584 11.1593 23.9059 10.8115 23.9103 10.4352C23.915 10.0392 24.2811 9.68633 24.6854 9.68883C25.1125 9.69139 25.4294 10.0163 25.4235 10.446H25.4228Z" fill="white"/>
                  <path d="M18.3577 12.928C18.0285 12.9438 17.7343 12.8759 17.5379 12.5891C17.394 12.3784 17.4057 12.1766 17.5898 11.9868C17.9487 11.6168 18.8696 11.5039 19.3116 11.7786C19.6428 11.9849 19.6272 12.4857 19.2824 12.7084C19.068 12.8468 18.729 12.9273 18.3577 12.928Z" fill="#50C8FD"/>
                </g>
              </g>
              <defs>
                <clipPath id="clip0_login_aff">
                  <rect width="38.4" height="36.3765" fill="white"/>
                </clipPath>
              </defs>
            </svg>
          </div>
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
