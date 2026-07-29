import React, { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { Mail, Lock, LogIn, CheckCircle, AlertCircle, Eye, EyeOff, UserCheck, ShieldCheck, KeyRound } from 'lucide-react';
import logoImg from '../assets/Green-Energy-Solution.png';

export const Login: React.FC = () => {
  const { login, createAccount, verifyPreApprovedEmail } = useAuthStore();
  const [authMode, setAuthMode] = useState<'signin' | 'create_account'>('signin');
  
  // Login form states
  const [emailOrPhone, setEmailOrPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Account creation states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [preApproveStatus, setPreApproveStatus] = useState<{ checked: boolean; isApproved: boolean; name?: string; role?: string } | null>(null);

  // Status states
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVerifyEmail = async (value: string) => {
    if (!value.trim()) {
      setPreApproveStatus(null);
      return;
    }
    const res = await verifyPreApprovedEmail(value.trim());
    if (res.isApproved && res.profile) {
      setPreApproveStatus({
        checked: true,
        isApproved: true,
        name: res.profile.fullName,
        role: res.profile.role.replace('_', ' ')
      });
      setError(null);
    } else {
      setPreApproveStatus({
        checked: true,
        isApproved: false
      });
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOrPhone.trim()) {
      setError('Please enter your email address or phone number.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const res = await login(emailOrPhone, password);
    if (!res.success) {
      setError(res.message || 'Login failed.');
      if (res.requirePasswordSetup) {
        setAuthMode('create_account');
        handleVerifyEmail(emailOrPhone);
      }
      setIsSubmitting(false);
    }
  };

  const handleCreateAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailOrPhone.trim()) {
      setError('Please enter your official email address or phone number.');
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    await new Promise((resolve) => setTimeout(resolve, 600));

    const res = await createAccount(emailOrPhone, newPassword);
    if (res.success) {
      setSuccessMsg(res.message);
    } else {
      setError(res.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-slate-50/50 text-slate-800 font-sans overflow-hidden">
      {/* BRAND PANEL - Visible on desktop only */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-950 relative flex-col justify-between p-16 text-white overflow-hidden">
        {/* Glow Effects */}
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[70%] rounded-full bg-emerald-600/10 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[100px]"></div>
        
        {/* Header */}
        <div className="relative z-10 flex items-center select-none">
          <div className="bg-white/95 backdrop-blur px-3.5 py-2 rounded-2xl shadow-xl border border-white/20">
            <img src={logoImg} alt="Green Energy Solution" className="h-10 w-auto object-contain" />
          </div>
        </div>

        {/* Brand Pitch */}
        <div className="relative z-10 my-auto max-w-lg space-y-6">
          <h1 className="text-4xl lg:text-5xl font-black tracking-tight leading-tight">
            Streamline Your Solar Sales & Installation.
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Green Energy Solution Pipeline is a high-performance, offline-first CRM engineered to connect managing directors, office administrators, and field engineers under one unified database environment.
          </p>
          
          <div className="space-y-4 pt-4 border-t border-slate-800">
            <div className="flex items-start space-x-3 group">
              <div className="bg-emerald-950 border border-emerald-800 p-1 rounded-md text-emerald-400 mt-0.5 group-hover:scale-110 transition-transform">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Interactive Pipeline Tracking</h4>
                <p className="text-slate-400 text-xs mt-0.5">Visualize leads from fresh contact to completed solar installation.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 group">
              <div className="bg-emerald-950 border border-emerald-800 p-1 rounded-md text-emerald-400 mt-0.5 group-hover:scale-110 transition-transform">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Mobile-First Site Surveys</h4>
                <p className="text-slate-400 text-xs mt-0.5">Field staff can capture geotagged inspection reports offline with photo proof.</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 group">
              <div className="bg-emerald-950 border border-emerald-800 p-1 rounded-md text-emerald-400 mt-0.5 group-hover:scale-110 transition-transform">
                <CheckCircle className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-200">Instant PDF Challans & Quotations</h4>
                <p className="text-slate-400 text-xs mt-0.5">Create detailed product checklists and generate PDF sheets in a click.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-[10px] text-slate-500 font-semibold tracking-wide flex justify-between items-center select-none border-t border-slate-900 pt-6">
          <span>GREEN ENERGY SOLUTION</span>
          <span>SYSTEM OF RECORD • V1.0.0 PWA</span>
        </div>
      </div>

      {/* LOGIN CARD PANEL */}
      <div className="w-full lg:w-1/2 flex flex-col justify-between p-6 sm:p-12 md:p-16 overflow-y-auto">
        {/* Mobile Header */}
        <div className="flex lg:hidden justify-between items-center mb-8 select-none">
          <div className="flex items-center">
            <img src={logoImg} alt="Green Energy Solution" className="h-8 w-auto object-contain" />
          </div>
          <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded border border-slate-200">
            Enterprise Portal
          </span>
        </div>

        <div className="my-auto max-w-md w-full mx-auto space-y-6 py-6">
          {/* Mode Switcher Tabs */}
          <div className="flex p-1 bg-slate-200/70 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setAuthMode('signin');
                setError(null);
                setSuccessMsg(null);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                authMode === 'signin'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAuthMode('create_account');
                setError(null);
                setSuccessMsg(null);
                if (emailOrPhone) handleVerifyEmail(emailOrPhone);
              }}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                authMode === 'create_account'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Create Account / Set Password</span>
            </button>
          </div>

          {/* Headline */}
          <div className="space-y-1.5 text-center lg:text-left">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {authMode === 'signin' ? 'Sign in to your account' : 'Set Account Password'}
            </h2>
            <p className="text-slate-400 text-xs font-medium">
              {authMode === 'signin'
                ? 'Enter your pre-approved email address & password to continue.'
                : 'Enter your Super Admin pre-authorized email to create your password.'}
            </p>
          </div>

          {/* Status Messages */}
          {error && (
            <div className="bg-rose-50 border border-rose-200/80 rounded-xl p-3 flex items-start space-x-2.5 text-rose-700 text-xs font-semibold animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-start space-x-2.5 text-emerald-800 text-xs font-bold">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* MODE 1: SIGN IN FORM */}
          {authMode === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="login-identity" className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Official Email Address or Phone Number
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="login-identity"
                    type="text"
                    placeholder="e.g. admin@greenenergysolution.com"
                    value={emailOrPhone}
                    onChange={(e) => {
                      setEmailOrPhone(e.target.value);
                      setError(null);
                    }}
                    disabled={isSubmitting}
                    className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl py-3.5 pl-10 pr-4 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label htmlFor="login-password" className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                    Account Password
                  </label>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your account password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl py-3.5 pl-10 pr-10 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title={showPassword ? 'Hide Password' : 'Show Password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-600/10 hover:shadow-emerald-600/25 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>
          ) : (
            /* MODE 2: CREATE ACCOUNT / SET PASSWORD FORM */
            <form onSubmit={handleCreateAccountSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="create-email" className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Pre-Approved Email Address
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="create-email"
                    type="text"
                    placeholder="Enter email added by Super Admin"
                    value={emailOrPhone}
                    onChange={(e) => {
                      setEmailOrPhone(e.target.value);
                      handleVerifyEmail(e.target.value);
                    }}
                    disabled={isSubmitting}
                    className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl py-3.5 pl-10 pr-4 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all"
                  />
                </div>

                {preApproveStatus && preApproveStatus.checked && (
                  <div className="mt-1">
                    {preApproveStatus.isApproved ? (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200 font-bold">
                        <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>✓ Verified Pre-Approved Account for: {preApproveStatus.name} ({preApproveStatus.role})</span>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5 text-[11px] text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200 font-semibold">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <span>❌ Email "{emailOrPhone}" is not added by Super Admin yet. Please ask Super Admin to register your email address first.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="new-password" className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Create New Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a strong password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={isSubmitting || (preApproveStatus?.checked && !preApproveStatus.isApproved)}
                    className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl py-3.5 pl-10 pr-10 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                  Confirm Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="confirm-password"
                    type="password"
                    placeholder="Re-enter password to confirm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={isSubmitting || (preApproveStatus?.checked && !preApproveStatus.isApproved)}
                    className="w-full bg-white border border-slate-200 hover:border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl py-3.5 pl-10 pr-4 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || (preApproveStatus?.checked && !preApproveStatus.isApproved)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-600/10 hover:shadow-emerald-600/25 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Setting Password...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Create Password & Activate Account</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="text-[10px] text-slate-400 text-center font-bold tracking-wide mt-8 select-none border-t border-slate-100 pt-4">
          © 2026 GREEN ENERGY SOLUTION • ENTERPRISE PORTAL
        </div>
      </div>
    </div>
  );
};

export default Login;
