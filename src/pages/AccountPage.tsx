import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Mail, Lock, LogOut, Calendar, Check, X, MessageCircle, Trash2, Bug, Send, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import { StarRating } from '../components/StarRating';
import { Link } from 'react-router-dom';
import { cacheGet, cacheSet, enqueueCommentOp } from '../lib/offlineCache';
import { formatRecipeType } from '../lib/utils';
import { markDirty, flushWrites, forceSync } from '../lib/syncManager';

const SPECIAL_CHARS = /[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;

const PASSWORD_RULES: { key: string; label: string; test: (v: string) => boolean }[] = [
  { key: 'length', label: '8+ characters', test: (v) => v.length >= 8 },
  { key: 'case', label: 'Upper & lower case', test: (v) => /[A-Z]/.test(v) && /[a-z]/.test(v) },
  { key: 'number', label: 'At least 1 number', test: (v) => /[0-9]/.test(v) },
  { key: 'special', label: 'At least 1 special character', test: (v) => SPECIAL_CHARS.test(v) },
];

// ---------------------------------------------------------------------------
// Bug Report Modal
// ---------------------------------------------------------------------------

interface BugReportModalProps {
  user: User;
  onClose: () => void;
}

function BugReportModal({ user, onClose }: BugReportModalProps) {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const MIN_LENGTH = 20;

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim().length < MIN_LENGTH) return;
    setSubmitting(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-bug-report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ message: message.trim() }),
        }
      );
      if (!res.ok) throw new Error('Failed to send');
    } catch {
      // Fall back to storing locally so the report isn't lost
      await supabase.from('bug_reports').insert({
        user_id: user.id,
        user_email: user.email ?? '',
        message: message.trim(),
      }).then(() => {});
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center animate-fade-in">
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 rounded-full p-4">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Report Submitted</h3>
          <p className="text-sm text-gray-600 mb-6">
            Thank you for the feedback! Your bug report has been sent to our support team. We'll look into it as soon as possible.
          </p>
          <button
            onClick={onClose}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 rounded-xl transition text-sm"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const trimmed = message.trim();
  const charCount = trimmed.length;
  const isReady = charCount >= MIN_LENGTH;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="bg-orange-100 rounded-lg p-2">
              <Bug className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Report a Bug</h3>
              <p className="text-xs text-gray-500">Help us improve RecipeHub</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Describe the issue
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please describe the bug you encountered — what happened, what you expected to happen, and the steps to reproduce it..."
              rows={8}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition"
              autoFocus
            />
            <div className="flex items-center justify-between mt-1.5">
              <p className={`text-xs transition-colors ${isReady ? 'text-green-600' : 'text-gray-400'}`}>
                {isReady ? 'Ready to submit' : `${MIN_LENGTH - charCount} more characters needed`}
              </p>
              <p className="text-xs text-gray-400">{charCount} characters</p>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
            <p className="text-xs text-orange-700">
              Your report will be sent directly to our support team. Your email address will be included so we can follow up if needed.
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isReady || submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition text-sm"
            >
              {submitting ? (
                <span>Sending...</span>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send Report
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account Page
// ---------------------------------------------------------------------------

export function AccountPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [signInToast, setSignInToast] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [userRatings, setUserRatings] = useState<
    { id: string; rating: number; updated_at: string; recipe: { id: string; title: string; type: string | null } | null }[]
  >([]);
  const [userComments, setUserComments] = useState<
    { id: string; content: string; created_at: string; recipe: { id: string; title: string } | null }[]
  >([]);

  useEffect(() => {
    const cachedUser = cacheGet<User>('auth-user');
    if (cachedUser) {
      setUser(cachedUser);
      setLoading(false);
      loadCachedData(cachedUser.id);
    }

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        cacheSet('auth-user', data.user);
        setLoading(false);
        loadCachedData(data.user.id);

        forceSync().then(() => {
          loadCachedData(data.user!.id);
        });
      } else if (!cachedUser) {
        setLoading(false);
        navigate('/auth');
      }
    }).catch(() => {
      if (!cachedUser) {
        setLoading(false);
        navigate('/auth');
      }
    });
  }, [navigate]);

  useEffect(() => {
    if ((location.state as any)?.signedIn) {
      setSignInToast(true);
      window.history.replaceState({}, '');
      const timer = setTimeout(() => setSignInToast(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  function loadCachedData(uid: string) {
    const cachedRatings = cacheGet<typeof userRatings>(`user-ratings:${uid}`);
    if (cachedRatings) setUserRatings(cachedRatings);

    const cachedComments = cacheGet<typeof userComments>(`user-comments:${uid}`);
    if (cachedComments) setUserComments(cachedComments);
  }

  function handleDeleteComment(id: string) {
    const updated = userComments.filter((x) => x.id !== id);
    setUserComments(updated);
    if (user) cacheSet(`user-comments:${user.id}`, updated);

    enqueueCommentOp({ kind: 'delete', commentId: id, createdAt: new Date().toISOString() });
    markDirty();
    void flushWrites();
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

  const joinedAt = user.created_at ? new Date(user.created_at).toLocaleDateString() : '\u2014';

  return (
    <div className="min-h-[calc(100vh-3.5rem)] sm:min-h-[calc(100vh-4rem)] bg-gradient-to-br from-orange-50 to-amber-50 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">

      {signInToast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-down">
          <div className="bg-gray-900/80 backdrop-blur-sm text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg">
            Signed in successfully.
          </div>
        </div>
      )}

      {showBugReport && user && (
        <BugReportModal user={user} onClose={() => setShowBugReport(false)} />
      )}

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
          <p className="text-sm sm:text-base text-gray-600 mt-2">Manage your profile and credentials</p>
        </div>

        {/* Profile */}
        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Profile</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3 py-3 border-b border-gray-100">
              <div className="bg-orange-100 rounded-lg p-2 flex-shrink-0">
                <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wide">Email Address</p>
                <p className="text-sm sm:text-base text-gray-900 font-medium break-all">{user.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 py-3">
              <div className="bg-orange-100 rounded-lg p-2 flex-shrink-0">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-500 uppercase tracking-wide">Member Since</p>
                <p className="text-sm sm:text-base text-gray-900 font-medium">{joinedAt}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Ratings */}
        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Your Ratings</h2>
          <p className="text-sm text-gray-600 mb-4">Recipes you've rated ({userRatings.length})</p>
          {userRatings.length === 0 ? (
            <p className="text-sm text-gray-500">
              You haven't rated any recipes yet. Browse the{' '}
              <Link to="/" className="text-orange-600 hover:text-orange-700 font-medium">recipe collection</Link>{' '}
              to leave your first rating.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {userRatings.map((r) => (
                <li key={r.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {r.recipe ? (
                      <Link to={`/recipe/${r.recipe.id}`} className="block text-sm sm:text-base font-medium text-gray-900 hover:text-orange-700 truncate">{r.recipe.title}</Link>
                    ) : (
                      <span className="block text-sm sm:text-base font-medium text-gray-500 italic">Recipe removed</span>
                    )}
                    {r.recipe?.type && <p className="text-xs text-gray-500 mt-0.5">{formatRecipeType(r.recipe.type)}</p>}
                  </div>
                  <StarRating value={r.rating} readOnly showCount={false} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Comments */}
        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <MessageCircle className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Your Comments</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">Comments you've posted ({userComments.length})</p>
          {userComments.length === 0 ? (
            <p className="text-sm text-gray-500">You haven't commented on any recipes yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {userComments.map((c) => (
                <li key={c.id} className="py-3">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0 flex-1">
                      {c.recipe ? (
                        <Link to={`/recipe/${c.recipe.id}`} className="block text-sm sm:text-base font-medium text-gray-900 hover:text-orange-700 truncate">{c.recipe.title}</Link>
                      ) : (
                        <span className="block text-sm sm:text-base font-medium text-gray-500 italic">Recipe removed</span>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(c.created_at).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteComment(c.id)}
                      className="text-gray-400 hover:text-red-600 transition-colors p-1 flex-shrink-0"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{c.content}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Change Password */}
        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Change Password</h2>
          <form onSubmit={handleChangePassword} className="space-y-4" noValidate>
            <div>
              <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input id="newPassword" type="password" required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Create a strong password" className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm sm:text-base" />
              </div>
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {ruleResults.map((rule) => (
                  <li key={rule.key} className={`flex items-center gap-2 text-xs transition-colors ${rule.valid ? 'text-green-600' : 'text-gray-500'}`}>
                    {rule.valid ? <Check className="w-3.5 h-3.5 flex-shrink-0" /> : <X className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />}
                    <span>{rule.label}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input id="confirmPassword" type="password" required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your new password" className={`w-full pl-10 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm sm:text-base ${confirmPassword.length > 0 && !isPasswordMatch ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-orange-500'}`} />
              </div>
              {confirmPassword.length > 0 && !isPasswordMatch && <p className="mt-1.5 text-xs text-red-600">Passwords do not match.</p>}
            </div>
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{error}</div>}
            {message && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2.5">{message}</div>}
            <button type="submit" disabled={updating || !canUpdate} className="w-full sm:w-auto bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 sm:py-3 rounded-lg transition text-sm sm:text-base">{updating ? 'Updating...' : 'Update Password'}</button>
          </form>
        </div>

        {/* Sign Out */}
        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8 mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Sign Out</h2>
          <p className="text-sm text-gray-600 mb-4">Sign out of your account on this device.</p>
          <button onClick={handleLogout} className="flex items-center justify-center gap-2 w-full sm:w-auto bg-white border border-red-300 text-red-600 hover:bg-red-50 font-medium px-6 py-2.5 sm:py-3 rounded-lg transition text-sm sm:text-base">
            <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            Log Out
          </button>
        </div>

        {/* Report a Bug */}
        <div className="bg-white rounded-2xl shadow-lg p-5 sm:p-8">
          <div className="flex items-start gap-3">
            <div className="bg-gray-100 rounded-lg p-2 flex-shrink-0 mt-0.5">
              <Bug className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Report a Bug</h2>
              <p className="text-sm text-gray-600 mb-4">
                Found something broken or not working as expected? Let us know and we'll get it fixed.
              </p>
              <button
                onClick={() => setShowBugReport(true)}
                className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-medium px-5 py-2.5 rounded-lg transition text-sm"
              >
                <Bug className="w-4 h-4" />
                Report a Bug
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
