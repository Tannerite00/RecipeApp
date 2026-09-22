import { supabase } from './supabase';
import { cacheGet, cacheSet } from './offlineCache';
import type { Recipe } from './supabase';

const MAX_WIDTH = 1200;
const WEBP_QUALITY = 0.85;
const BUCKET = 'recipe-images';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function isSafeImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // Only allow URLs from our Supabase storage
    return parsed.origin === new URL(SUPABASE_URL).origin;
  } catch {
    return false;
  }
}

async function canModifyRecipe(recipeId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Check if user is admin
  const { data: adminRecord } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminRecord) return true;

  // Check if user owns the recipe
  const { data: recipe } = await supabase
    .from('recipes')
    .select('user_id')
    .eq('id', recipeId)
    .maybeSingle();
  return recipe?.user_id === user.id;
}

export async function convertToWebP(file: File): Promise<File> {
  if (file.type === 'image/webp') return file;

  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = objectUrl;
  });
  URL.revokeObjectURL(objectUrl);

  let { width, height } = img;
  if (width > MAX_WIDTH) {
    height = Math.round((height * MAX_WIDTH) / width);
    width = MAX_WIDTH;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) { reject(new Error('WebP conversion failed')); return; }
        const name = file.name.replace(/\.[^.]+$/, '') + '.webp';
        resolve(new File([blob], name, { type: 'image/webp' }));
      },
      'image/webp',
      WEBP_QUALITY
    );
  });
}

function updateRecipeImageInCache(recipeId: string, imageUrl: string | null) {
  const cached = cacheGet<Recipe[]>('recipes');
  if (cached) {
    cacheSet('recipes', cached.map((r) => r.id === recipeId ? { ...r, image_url: imageUrl } : r));
  }
}

export async function uploadRecipeImage(recipeId: string, file: File): Promise<string> {
  if (!(await canModifyRecipe(recipeId))) {
    throw new Error('You do not have permission to modify this recipe.');
  }

  const webpFile = await convertToWebP(file);
  const path = `${recipeId}.webp`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, webpFile, { upsert: true, contentType: 'image/webp' });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Bust any CDN cache by appending a timestamp
  const imageUrl = `${data.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('recipes')
    .update({ image_url: data.publicUrl })
    .eq('id', recipeId);
  if (updateError) throw updateError;

  updateRecipeImageInCache(recipeId, data.publicUrl);
  return imageUrl;
}

export async function removeRecipeImage(recipeId: string): Promise<void> {
  if (!(await canModifyRecipe(recipeId))) {
    throw new Error('You do not have permission to modify this recipe.');
  }

  await supabase.storage.from(BUCKET).remove([`${recipeId}.webp`]);

  const { error } = await supabase
    .from('recipes')
    .update({ image_url: null })
    .eq('id', recipeId);
  if (error) throw error;

  updateRecipeImageInCache(recipeId, null);
}
