import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { RecipeListPage } from './pages/RecipeListPage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
import { AddRecipePage } from './pages/AddRecipePage';
import { MealPlanPage } from './pages/MealPlanPage';
import { GroceryListPage } from './pages/GroceryListPage';
import { AuthPage } from './pages/AuthPage';
import { AccountPage } from './pages/AccountPage';
import { EditRecipePage } from './pages/EditRecipePage';
import { PersonalRecipesPage } from './pages/PersonalRecipesPage';
import { UpdateBanner } from './components/UpdateBanner';
import { SubscriptionPage } from './pages/SubscriptionPage';
import { AdminPage } from './pages/AdminPage';
import { initializePurchases } from './lib/purchases';
import { cacheGet } from './lib/offlineCache';

function App() {
  useEffect(() => {
    const cachedUser = cacheGet<{ id: string }>('auth-user');
    void initializePurchases(cachedUser?.id);
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 pb-16 sm:pb-0">
        <Navigation />
        <UpdateBanner />
        <Routes>
          <Route path="/" element={<RecipeListPage />} />
          <Route path="/recipe/:id" element={<RecipeDetailPage />} />
          <Route path="/add-recipe" element={<AddRecipePage />} />
          <Route path="/my-recipes" element={<PersonalRecipesPage />} />
          <Route path="/meal-plans" element={<MealPlanPage />} />
          <Route path="/grocery-list" element={<GroceryListPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/edit-recipe/:id" element={<EditRecipePage />} />
          <Route path="/subscription" element={<SubscriptionPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
