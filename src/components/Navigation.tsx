import { LogIn, CircleUser as UserCircle2, Home, Calendar, ShoppingCart, BookOpen, CircleUser as UserCircle } from 'lucide-react';
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

  const navItems = [
    { path: '/', icon: Home, label: 'Recipes' },
    { path: '/meal-plans', icon: Calendar, label: 'Meal Plan', mobileLabel: 'Plan' },
    { path: '/grocery-list', icon: ShoppingCart, label: 'Grocery List', mobileLabel: 'Grocery' },
    { path: '/my-recipes', icon: BookOpen, label: 'My Recipes', mobileLabel: 'Mine' },
  ] as const;

  return (
    <>
      {/* Top bar */}
      <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-14 sm:h-16 gap-2">
            {/* Logo */}
            <div
              className="flex items-center gap-2 cursor-pointer flex-shrink-0"
              onClick={() => navigate('/')}
            >
              <div
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#2dd4bf' }}
              >
                <svg viewBox="0 0 32 32" className="w-5 h-5 sm:w-6 sm:h-6" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <ellipse cx="16" cy="22.5" rx="10" ry="3.5" fill="white" opacity="0.3"/>
                  <ellipse cx="16" cy="21" rx="10" ry="3.5" fill="white"/>
                  <line x1="16" y1="19" x2="16" y2="10" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M16 15 C13 13 10 14 10 11 C13 11 15 13 16 15Z" fill="white"/>
                  <path d="M16 12 C19 10 22 11 22 8 C19 8 17 10 16 12Z" fill="white"/>
                </svg>
              </div>
              <span className="text-base sm:text-xl font-bold text-gray-900">Plantiful</span>
            </div>

            {/* Desktop nav tabs */}
            <div className="hidden sm:flex gap-1">
              {navItems.map(({ path, label }) => (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className={`px-4 py-2 rounded-lg text-base font-medium transition ${
                    isActive(path) ? 'bg-teal-100 text-teal-700' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
              {loggedIn ? (
                <button
                  onClick={() => navigate('/account')}
                  className={`ml-2 flex items-center gap-2 px-4 py-2 rounded-lg text-base font-medium transition ${
                    isActive('/account') ? 'bg-teal-700 text-white' : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  <UserCircle2 className="w-4 h-4" />
                  Account
                </button>
              ) : (
                <button
                  onClick={() => navigate('/auth')}
                  className={`ml-2 flex items-center gap-2 px-4 py-2 rounded-lg text-base font-medium transition ${
                    isActive('/auth') ? 'bg-teal-700 text-white' : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  Login
                </button>
              )}
            </div>

            {/* Mobile: account/login icon only */}
            <div className="sm:hidden">
              {loggedIn ? (
                <button
                  onClick={() => navigate('/account')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    isActive('/account') ? 'bg-teal-700 text-white' : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  <UserCircle className="w-4 h-4" />
                  Account
                </button>
              ) : (
                <button
                  onClick={() => navigate('/auth')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    isActive('/auth') ? 'bg-teal-700 text-white' : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  <LogIn className="w-4 h-4" />
                  Login
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
        <div className="flex">
          {navItems.map(({ path, icon: Icon, label, ...rest }) => {
            const active = isActive(path);
            const shortLabel = 'mobileLabel' in rest ? (rest as { mobileLabel: string }).mobileLabel : label;
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors min-h-[56px] ${
                  active ? 'text-teal-600' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium leading-tight">{shortLabel}</span>
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 bg-teal-600 rounded-b-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
