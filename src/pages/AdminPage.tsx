import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ImagePlus, Leaf, Search, Trash2, Upload, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Recipe } from '../lib/supabase';
import { cacheGet } from '../lib/offlineCache';
import { convertToWebP, uploadRecipeImage, removeRecipeImage } from '../lib/imageUtils';

// ---------------------------------------------------------------------------
// Upload Modal
// ---------------------------------------------------------------------------

interface UploadModalProps {
  recipe: Recipe;
  onClose: () => void;
  onSaved: (recipeId: string, imageUrl: string) => void;
}

function UploadModal({ recipe, onClose, onSaved }: UploadModalProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileSize, setFileSize] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  async function processFile(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('File too large. Maximum 20 MB.');
      return;
    }
    try {
      const webp = await convertToWebP(file);
      setPendingFile(webp);
      setFileSize((webp.size / 1024).toFixed(0) + ' KB');
      const url = URL.createObjectURL(webp);
      setPreview(url);
    } catch {
      setError('Failed to process image. Please try another file.');
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  async function handleSave() {
    if (!pendingFile) return;
    setError(null);
    setUploading(true);
    try {
      const imageUrl = await uploadRecipeImage(recipe.id, pendingFile);
      onSaved(recipe.id, imageUrl);
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Upload Image</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{recipe.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {!preview ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
                dragging ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
              }`}
            >
              <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
                <Upload className="w-6 h-6 text-teal-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">Drop image here or click to browse</p>
                <p className="text-xs text-gray-500 mt-1">Any image format — converted to WebP automatically</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden bg-gray-100 aspect-video">
                <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  onClick={() => { setPreview(null); setPendingFile(null); setFileSize(''); }}
                  className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="bg-teal-100 text-teal-700 font-medium px-2 py-0.5 rounded">WebP</span>
                <span>{fileSize}</span>
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50 transition text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!pendingFile || uploading}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition text-sm"
            >
              {uploading ? 'Uploading…' : (
                <>
                  <ImagePlus className="w-4 h-4" />
                  Save Image
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Page
// ---------------------------------------------------------------------------

export function AdminPage() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadTarget, setUploadTarget] = useState<Recipe | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = cacheGet<{ id: string }>('auth-user');
    if (!user) { navigate('/auth'); return; }

    supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) { navigate('/account'); return; }
        loadRecipes();
      });
  }, [navigate]);

  function loadRecipes() {
    const cached = cacheGet<Recipe[]>('recipes');
    if (cached?.length) {
      setRecipes(cached.filter((r) => !r.is_user_recipe));
      setLoading(false);
      return;
    }
    supabase.from('recipes').select('id, title, type, image_url, is_user_recipe')
      .eq('is_user_recipe', false)
      .order('title')
      .then(({ data }) => {
        setRecipes((data ?? []) as Recipe[]);
        setLoading(false);
      });
  }

  const filtered = recipes.filter((r) =>
    !searchQuery.trim() || r.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function handleSaved(recipeId: string, imageUrl: string) {
    setRecipes((prev) => prev.map((r) => r.id === recipeId ? { ...r, image_url: imageUrl } : r));
  }

  async function handleRemove(recipe: Recipe) {
    if (removeConfirm !== recipe.id) { setRemoveConfirm(recipe.id); return; }
    setRemoveConfirm(null);
    setRemoving(recipe.id);
    setError(null);
    try {
      await removeRecipeImage(recipe.id);
      setRecipes((prev) => prev.map((r) => r.id === recipe.id ? { ...r, image_url: null } : r));
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to remove image.');
    } finally {
      setRemoving(null);
    }
  }

  const withImages = recipes.filter((r) => r.image_url).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-cyan-50 py-6 sm:py-10 px-4 sm:px-6 lg:px-8">
      {uploadTarget && (
        <UploadModal
          recipe={uploadTarget}
          onClose={() => setUploadTarget(null)}
          onSaved={handleSaved}
        />
      )}

      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => navigate('/account')}
          className="flex items-center gap-2 text-teal-600 hover:text-teal-700 mb-6 font-medium text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Account
        </button>

        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-sm text-gray-600 mt-1">
              {loading ? 'Loading…' : `${recipes.length} recipes — ${withImages} with images`}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search recipes…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-white rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-500 text-sm">Loading recipes…</div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-gray-500 text-sm">No recipes found</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((recipe) => (
              <RecipeImageCard
                key={recipe.id}
                recipe={recipe}
                removing={removing === recipe.id}
                confirmingRemove={removeConfirm === recipe.id}
                onUpload={() => { setRemoveConfirm(null); setUploadTarget(recipe); }}
                onRemove={() => handleRemove(recipe)}
                onCancelRemove={() => setRemoveConfirm(null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipe Image Card
// ---------------------------------------------------------------------------

interface CardProps {
  recipe: Recipe;
  removing: boolean;
  confirmingRemove: boolean;
  onUpload: () => void;
  onRemove: () => void;
  onCancelRemove: () => void;
}

function RecipeImageCard({ recipe, removing, confirmingRemove, onUpload, onRemove, onCancelRemove }: CardProps) {
  const hasImage = !!recipe.image_url;

  return (
    <div className="bg-white rounded-xl shadow overflow-hidden flex flex-col">
      {/* Image area */}
      <div className="relative h-40 bg-gray-50 flex items-center justify-center overflow-hidden">
        {hasImage ? (
          <img
            src={recipe.image_url!}
            alt={recipe.title}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-teal-100 to-emerald-100">
            <Leaf className="w-10 h-10 text-teal-300" />
          </div>
        )}
        {hasImage && (
          <div className="absolute top-2 right-2">
            <span className="text-xs font-semibold bg-teal-600 text-white px-2 py-0.5 rounded-full shadow">
              WebP
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-3.5 flex flex-col gap-3 flex-1">
        <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">{recipe.title}</p>

        {/* Actions */}
        {confirmingRemove ? (
          <div className="mt-auto space-y-2">
            <p className="text-xs text-red-600 font-medium">Remove this image?</p>
            <div className="flex gap-2">
              <button
                onClick={onCancelRemove}
                className="flex-1 py-1.5 text-xs font-medium border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={onRemove}
                disabled={removing}
                className="flex-1 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-auto flex gap-2">
            <button
              onClick={onUpload}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              {hasImage ? 'Change' : 'Upload'}
            </button>
            {hasImage && (
              <button
                onClick={onRemove}
                disabled={removing}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-40"
                aria-label="Remove image"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
