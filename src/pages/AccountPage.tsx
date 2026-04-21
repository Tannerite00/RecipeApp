import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Lock, LogOut, Calendar, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { StarRating } from '../components/StarRating';
import { Link } from 'react-router-dom';
import { cacheGet, cacheSet } from '../lib/offlineCache';

const SPECIAL_CHARS = /[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;

const PASSWORD_RULES: { key: string; label: string; test: (v: string) => boolean }[] = [
  { key: 'length', label: '8+ characters', test: (v) => v.length >= 8 },
  { key: 'case', label: 'Upper & lower case', test: (v) => /[A-Z]/.test(v) && /[a-z]/.test(v) },
  { key: 'number', label: 'At least 1 number', test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'At least 1 special character', test: (v) => SPECIAL_CHARS.test(v) },
];

export function AccountPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [userRatings, setUserRatings] = useState<
    { id: string; rating: number; updated_at: string; recipe: { id: string; title: string; type: string | null } | null }[]
  >([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      setLoading(false);
      if (!data.user) {
        navigate('/auth');
        return;
      }
      await loadUserRatings(data.user.id);
    });
  }, [navigate]);

  async function loadUserRatings(uid: string) {
    const cacheKey = `user-ratings:${uid}`;
    const cached = cacheGet<typeof userRatings>(cacheKey);
    if (cached) setUserRatings(cached);

    const { data, error } = await supabase
      .from('recipe_ratings')
      .select('id, rating, updated_at, recipe:recipes(id, title, type)')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false });
    if (error) {
      if (!cached) console.error('Error loading user ratings:', error);
      return;
    }
    const rows = (data as any) || [];
    setUserRatings(rows);
    cacheSet(cacheKey, rows);
  }

  const ruleResults = useMemo(
    () => PASSWORD_RULES.map((r) => ({ ...r, valid: r.test(newPassword) })),
    [newPassword]
  );
  const isPasswordValid = ruleResults.every((r) => r.valid);
  const isPasswordMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canUpdate = isPasswordValid && isPasswordMatch;

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!isPasswordValid) {
      setError('Password does not meet all the requirements.');
      return;
    }
    if (!isPasswordMatch) {
      setError('Passwords do not match.');
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setMessage('Password updated successfully.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setUpdating(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user) return null;

  const joinedAt = user.created_at ? new Date(user.created_at).toLocaleDateString() : '—';

  return (
    <div className="min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)] bg-gradient-to-br from-orange-50 to-amber-50 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-orange-600 hover:text-orange-700 mb-4 sm:mb-6 font-medium text-sm sm:text-base"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          Back to Recipes
        </button>

        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900">Account</h1>
          <p className="text-sm sm:text-base text-gray-600 mt-2">
            Manage your profile and credentials
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Profile</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 py-3 border-b border-gray-100">
              <div className="bg-orange-100 rounded-lg p-2 flex-shrink-0">
                <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Email Address
                </p>
                <p className="text-sm sm:text-base text-gray-900 font-medium break-all">
                  {user.email}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 py-3">
              <div className="bg-orange-100 rounded-lg p-2 flex-shrink-0">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wide">
                  Member Since
                </p>
                <p className="text-sm sm:text-base text-gray-900 font-medium">{joinedAt}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Your Ratings</h2>
          <p className="text-sm text-gray-600 mb-4">
            Recipes you've rated ({userRatings.length})
          </p>
          {userRatings.length === 0 ? (
            <p className="text-sm text-gray-500">
              You haven't rated any recipes yet. Browse the{' '}
              <Link to="/" className="text-orange-600 hover:text-orange-700 font-medium">
                recipe collection
              </Link>{' '}
              to leave your first rating.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {userRatings.map((r) => (
                <li key={r.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {r.recipe ? (
                      <Link
                        to={`/recipe/${r.recipe.id}`}
                        className="block text-sm sm:text-base font-medium text-gray-900 hover:text-orange-700 truncate"
                      >
                        {r.recipe.title}
                      </Link>
                    ) : (
                      <span className="block text-sm sm:text-base font-medium text-gray-500 italic">
                        Recipe removed
                      </span>
                    )}
                    {r.recipe?.type && (
                      <p className="text-xs text-gray-500 mt-0.5">{r.recipe.type}</p>
                    )}
                  </div>
                  <StarRating value={r.rating} readOnly showCount={false} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Change Password</h2>
          <form onSubmit={handleChangePassword} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="newPassword"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="newPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm sm:text-base"
                />
              </div>

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
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Confirm New Password
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
                  placeholder="Re-enter your new password"
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
              disabled={updating || !canUpdate}
              className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 sm:py-3 rounded-lg transition text-sm sm:text-base"
            >
              {updating ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Sign Out</h2>
          <p className="text-sm text-gray-600 mb-4">
            Sign out of your account on this device.
          </p>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full sm:w-auto bg-white border border-red-300 text-red-600 hover:bg-red-50 font-medium px-6 py-2.5 sm:py-3 rounded-lg transition text-sm sm:text-base"
          >
            <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
