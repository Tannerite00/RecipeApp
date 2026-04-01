export function parseISO8601Duration(duration: string): string {
  if (!duration || duration === 'PT0D0H0M') return 'N/A';

  const hoursMatch = duration.match(/(\d+)H/);
  const minutesMatch = duration.match(/(\d+)M/);

  const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.length > 0 ? parts.join(' ') : 'N/A';
}

export function getWeekDates(startDate: Date) {
  const days = [];
  const dayLabels = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    days.push({
      label: dayLabels[i],
      date: date.toISOString().split('T')[0],
      displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    });
  }

  return days;
}

export function aggregateIngredients(ingredients: string[][]): Record<string, number> {
  const aggregated: Record<string, number> = {};

  ingredients.forEach(ingredientList => {
    ingredientList.forEach(ingredient => {
      const cleaned = ingredient.trim().replace(/<[^>]*>/g, '');
      if (cleaned) {
        aggregated[cleaned] = (aggregated[cleaned] || 0) + 1;
      }
    });
  });

  return aggregated;
}
