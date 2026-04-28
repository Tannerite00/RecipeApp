import { useEffect, useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Trash2, Send } from 'lucide-react';
import { usernameFromEmail, type RecipeComment } from '../lib/supabase';
import { cacheGet, cacheSet, enqueueCommentOp } from '../lib/offlineCache';
import { markDirty, flushWrites } from '../lib/syncManager';

interface Props {
  recipeId: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function RecipeComments({ recipeId }: Props) {
  const navigate = useNavigate();
  const [comments, setComments] = useState<RecipeComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cachedUser = cacheGet<{ id: string; email: string }>('auth-user');
    if (cachedUser) {
      setCurrentUserId(cachedUser.id);
      setCurrentEmail(cachedUser.email);
    }

    const cached = cacheGet<RecipeComment[]>(`comments:${recipeId}`);
    setComments(cached || []);
    setLoading(false);
  }, [recipeId]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!currentUserId) {
      navigate('/auth');
      return;
    }
    const content = draft.trim();
    if (!content) return;
    setSubmitting(true);

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    enqueueCommentOp({
      kind: 'add',
      tempId,
      userId: currentUserId,
      recipeId,
      userEmail: currentEmail ?? '',
      content,
      createdAt: new Date().toISOString(),
    });
    markDirty();

    const offlineComment: RecipeComment = {
      id: tempId,
      user_id: currentUserId,
      recipe_id: recipeId,
      user_email: currentEmail ?? '',
      content,
      created_at: new Date().toISOString(),
    };
    const updated = [offlineComment, ...comments];
    setComments(updated);
    cacheSet(`comments:${recipeId}`, updated);
    setDraft('');
    setSubmitting(false);
    void flushWrites();
  }

  function handleDelete(id: string) {
    const updated = comments.filter((x) => x.id !== id);
    setComments(updated);
    cacheSet(`comments:${recipeId}`, updated);

    enqueueCommentOp({ kind: 'delete', commentId: id, createdAt: new Date().toISOString() });
    markDirty();
    void flushWrites();
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-5 sm:p-8">
      <div className="flex items-center gap-2 mb-4 sm:mb-6">
        <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
          Comments{' '}
          <span className="text-gray-400 font-normal text-base sm:text-lg">
            ({comments.length})
          </span>
        </h2>
      </div>

      {currentUserId ? (
        <form onSubmit={handleSubmit} className="mb-6">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Share your thoughts on this recipe..."
            rows={3}
            maxLength={1000}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-sm sm:text-base resize-y"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-400">{draft.length}/1000</span>
            <button
              type="submit"
              disabled={submitting || draft.trim().length === 0}
              className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-lg transition text-sm"
            >
              <Send className="w-4 h-4" />
              {submitting ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </form>
      ) : (
        <div className="mb-6 p-4 bg-orange-50 border border-orange-100 rounded-lg text-sm text-gray-700">
          <button
            type="button"
            onClick={() => navigate('/auth')}
            className="text-orange-600 hover:text-orange-700 font-semibold"
          >
            Sign in
          </button>{' '}
          to join the conversation.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-500">No comments yet. Be the first to share!</p>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => {
            const username = usernameFromEmail(c.user_email);
            const isMine = c.user_id === currentUserId;
            return (
              <li
                key={c.id}
                className="border border-gray-100 rounded-lg p-4 bg-gray-50/50"
              >
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {username.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {username}
                      </p>
                      <p className="text-xs text-gray-500">{formatDate(c.created_at)}</p>
                    </div>
                  </div>
                  {isMine && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-gray-400 hover:text-red-600 transition-colors p-1"
                      aria-label="Delete comment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <p className="text-sm sm:text-base text-gray-800 whitespace-pre-wrap break-words">
                  {c.content}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
