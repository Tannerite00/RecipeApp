import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChefHat, Mail, Lock, ArrowLeft, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Mode = 'login' | 'signup';

const SPECIAL_CHARS = /[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const PASSWORD_RULES: { key: string; label: string; test: (v: string) => boolean }[] = [
  { key: 'length', label: '8+ characters', test: (v) => v.length >= 8 },
  { key: 'case', label: 'Upper & lower case', test: (v) => /[A-Z]/.test(v) && /[a-z]/.test(v) },
  { key: 'number', label: 'At least 1 number', test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'At least 1 special character', test: (v) => SPECIAL_CHARS.test(v) },
];

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isEmailValid = EMAIL_REGEX.test(email);
  const ruleResults = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, valid: r.test(password) })),
    [password]
  );
  const isPasswordValid = ruleResults.every((r) => r.valid);
  const isPasswordMatch = password.length > 0 && password === confirmPassword;

  const canSubmit =
    mode === 'login'
      ? isEmailValid && password.length > 0
      : isEmailValid && isPasswordValid && isPasswordMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!isEmailValid) {
      setError('Please enter a valid email address.');
      return;
    }

    if (mode === 'signup') {
      if (!isPasswordValid) {
        setError('Password does not meet all the requirements.');
        return;
      }
      if (!isPasswordMatch) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        navigate('/account', { state: { signedIn: true }, replace: true });
        return;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/account', { state: { signedIn: true }, replace: true });
        return;
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setMessage(null);
    setConfirmPassword('');
  };

  const showEmailError = email.length > 0 && !isEmailValid;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)] bg-gradient-to-br from-orange-50 to-amber-50 py-8 sm:py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-orange-600 hover:text-orange-700 mb-4 sm:mb-6 font-medium text-sm sm:text-base"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          Back to Recipes
        </button>

        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <div className="flex flex-col items-center mb-6 sm:mb-8">
            <div className="bg-orange-100 rounded-full p-3 mb-3">
              <ChefHat className="w-7 h-7 sm:w-8 sm:h-8 text-orange-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
              {mode === 'login' ? 'Welcome back' : 'Create an account'}
            </h1>
            <p className="text-sm sm:text-base text-gray-600 mt-2 text-center">
              {mode === 'login'
                ? 'Sign in to continue planning your meals'
                : 'Sign up to start planning your meals'}
            </p>
          </div>

          <div className="flex gap-2 bg-orange-50 p-1 rounded-lg mb-6">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                mode === 'login'
                  ? 'bg-white text-orange-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                mode === 'signup'
                  ? 'bg-white text-orange-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm sm:text-base ${
                    showEmailError
                      ? 'border-red-300 focus:ring-red-500'
                      : 'border-gray-300 focus:ring-orange-500'
                  }`}
                />
              </div>
              {showEmailError && (
                <p className="mt-1.5 text-xs text-red-600">Please enter a valid email address.</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'Create a strong password' : 'Your password'}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm sm:text-base"
                />
              </div>

              {mode === 'signup' && (
                <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                  {ruleResults.map((rule) => (
                    <li
                      key={rule.key}
                      className={`flex items-center gap-2 text-xs transition-colors ${
                        rule.valid ? 'text-green-600' : 'text-gray-500'
                      }`}
                    >
                      {rule.valid ? (
                        <Check className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : (
                        <X className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                      )}
                      <span>{rule.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {mode === 'signup' && (
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm sm:text-base ${
                      confirmPassword.length > 0 && !isPasswordMatch
                        ? 'border-red-300 focus:ring-red-500'
                        : 'border-gray-300 focus:ring-orange-500'
                    }`}
                  />
                </div>
                {confirmPassword.length > 0 && !isPasswordMatch && (
                  <p className="mt-1.5 text-xs text-red-600">Passwords do not match.</p>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}

            {message && (
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2.5">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-2.5 sm:py-3 rounded-lg transition text-sm sm:text-base"
            >
              {loading
                ? 'Please wait...'
                : mode === 'login'
                ? 'Sign In'
                : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 mt-6">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="text-orange-600 hover:text-orange-700 font-medium"
            >
              {mode === 'login' ? 'Sign up' : 'Log in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
