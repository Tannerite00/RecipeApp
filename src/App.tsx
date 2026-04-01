import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navigation } from './components/Navigation';
import { RecipeListPage } from './pages/RecipeListPage';
import { RecipeDetailPage } from './pages/RecipeDetailPage';
import { MealPlanPage } from './pages/MealPlanPage';
import { GroceryListPage } from './pages/GroceryListPage';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <Routes>
          <Route path="/" element={<RecipeListPage />} />
          <Route path="/recipe/:id" element={<RecipeDetailPage />} />
          <Route path="/meal-plans" element={<MealPlanPage />} />
          <Route path="/grocery-list" element={<GroceryListPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
