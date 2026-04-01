import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import recipes from './recipes.json' with { type: 'json' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase credentials');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const recipesToInsert = recipes.map((recipe: any) => ({
      title: recipe.title,
      type: recipe.type,
      cook_time: recipe.cook_time,
      prep_time: recipe.prep_time,
      servings: recipe.servings,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      rating: recipe.rating || null,
      url: recipe.url || null,
    }));

    const { data, error } = await supabase
      .from('recipes')
      .insert(recipesToInsert)
      .select();

    if (error) throw error;

    return new Response(
      JSON.stringify({
        message: `Successfully added ${data?.length || 0} recipes`,
        count: data?.length || 0,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
