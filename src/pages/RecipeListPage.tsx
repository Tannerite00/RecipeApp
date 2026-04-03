import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { supabase, type Recipe } from '../lib/supabase';
import { parseISO8601Duration } from '../lib/utils';

export function RecipeListPage() {
  const navigate = useNavigate();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [loading, setLoading] = useState(true);
  const [recipeTypes, setRecipeTypes] = useState<string[]>([]);

  useEffect(() => {
    fetchRecipes();
  }, []);

  async function fetchRecipes() {
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('title');

      if (error) throw error;
      setRecipes(data || []);
      setFilteredRecipes(data || []);

      const types = Array.from(new Set((data || []).map(r => r.type).filter(Boolean))).sort();
      setRecipeTypes(types);
    } catch (err) {
      console.error('Error fetching recipes:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let filtered = recipes;

    if (selectedType) {
      filtered = filtered.filter(recipe => recipe.type === selectedType);
    }

    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(recipe =>
        recipe.title.toLowerCase().includes(query)
      );
    }

    setFilteredRecipes(filtered);
  }, [searchQuery, selectedType, recipes]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Recipe Collection</h1>
          <p className="text-gray-600">Browse and discover delicious recipes</p>
        </div>

        <div className="mb-8 space-y-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search recipes by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700">Filter by Type:</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            >
              <option value="">All Types</option>
              {recipeTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {selectedType && (
              <button
                onClick={() => setSelectedType('')}
                className="flex items-center gap-1 px-3 py-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-gray-500">Loading recipes...</div>
          </div>
        ) : filteredRecipes.length === 0 ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-gray-500">
              {searchQuery ? 'No recipes found matching your search' : 'No recipes available'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecipes.map((recipe) => (
              <button
                key={recipe.id}
                onClick={() => navigate(`/recipe/${recipe.id}`)}
                className="bg-white rounded-lg shadow hover:shadow-lg transition p-6 text-left hover:scale-105 transform duration-200"
              >
                <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">{recipe.title}</h3>
                <p className="text-sm text-gray-600 mb-4">{recipe.type}</p>
                <div className="flex gap-4 text-sm text-gray-700 items-center">
                  <div>
                    <span className="font-medium">Prep:</span>
                    <p className="text-gray-600">{parseISO8601Duration(recipe.prep_time)}</p>
                  </div>
                  <div>
                    <span className="font-medium">Cook:</span>
                    <p className="text-gray-600">{parseISO8601Duration(recipe.cook_time)}</p>
                  </div>
                  {recipe.rating && (
                    <div className="ml-auto">
                      <p className="text-gray-600">★ {recipe.rating}</p>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
