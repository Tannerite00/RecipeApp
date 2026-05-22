import { LogIn, CircleUser as UserCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { cacheGet } from '../lib/offlineCache';

export function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loggedIn, setLoggedIn] = useState<boolean>(() => {
    return cacheGet<{ id: string }>('auth-user') !== null;
  });

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setLoggedIn(!!newSession);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14 sm:h-16 gap-2">
          <div className="flex items-center gap-2 cursor-pointer flex-shrink-0" onClick={() => navigate('/')}>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#2dd4bf' }}>
              <span className="text-white font-bold italic text-base sm:text-lg leading-none select-none">B</span>
            </div>
            <span className="text-base sm:text-xl font-bold text-gray-900">Bento</span>
          </div>

          <div className="flex gap-0.5 sm:gap-1">
            <button
              onClick={() => navigate('/')}
              className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-base font-medium transition ${
                isActive('/')
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Recipes
            </button>
            <button
              onClick={() => navigate('/meal-plans')}
              className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-base font-medium transition ${
                isActive('/meal-plans')
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="sm:hidden">Plan</span>
              <span className="hidden sm:inline">Meal Plan</span>
            </button>
            <button
              onClick={() => navigate('/grocery-list')}
              className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-base font-medium transition ${
                isActive('/grocery-list')
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="sm:hidden">Grocery</span>
              <span className="hidden sm:inline">Grocery List</span>
            </button>
            {loggedIn ? (
              <button
                onClick={() => navigate('/account')}
                className={`ml-1 sm:ml-2 flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-base font-medium transition ${
                  isActive('/account')
                    ? 'bg-orange-700 text-white'
                    : 'bg-orange-600 text-white hover:bg-orange-700'
                }`}
              >
                <UserCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Account</span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/auth')}
                className={`ml-1 sm:ml-2 flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-base font-medium transition ${
                  isActive('/auth')
                    ? 'bg-orange-700 text-white'
                    : 'bg-orange-600 text-white hover:bg-orange-700'
                }`}
              >
                <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
