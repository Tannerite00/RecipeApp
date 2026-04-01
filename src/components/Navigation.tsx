import { ChefHat } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

export function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <ChefHat className="w-6 h-6 text-orange-600" />
            <span className="text-xl font-bold text-gray-900">RecipeHub</span>
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => navigate('/')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                isActive('/')
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Recipes
            </button>
            <button
              onClick={() => navigate('/meal-plans')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                isActive('/meal-plans')
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Meal Plan
            </button>
            <button
              onClick={() => navigate('/grocery-list')}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                isActive('/grocery-list')
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Grocery List
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
