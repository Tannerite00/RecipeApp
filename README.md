# RecipeHub

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-wezxtc3l)

## Running the app offline (local Supabase)

The app can run fully offline against a local Supabase stack. You will need
[Docker Desktop](https://www.docker.com/products/docker-desktop/) and the
[Supabase CLI](https://supabase.com/docs/guides/cli) installed.

1. Start Docker Desktop.
2. Boot the local Supabase stack:

   ```bash
   npm run db:start
   ```

   First run downloads the Postgres, Auth, Storage, Realtime, and Studio
   images (done once, then cached for offline use). Subsequent starts work
   without internet.

3. Copy the local env template and point the frontend at the local stack:

   ```bash
   cp .env.local.example .env.local
   ```

   The defaults in that file match the keys `supabase start` prints. If you
   ever see mismatched keys, run `npm run db:status` and paste the printed
   `API URL` and `anon key` into `.env.local`.

4. Seed recipe data into the local DB (optional). Use Supabase Studio at
   <http://127.0.0.1:54323> or invoke the `seed-recipes` edge function
   locally.

5. Run the dev server:

   ```bash
   npm run dev
   ```

Vite loads `.env.local` in preference to `.env`, so when `.env.local` exists
the app talks to your local stack. Delete or rename it to switch back to the
hosted Supabase project.

### Useful commands

| Command             | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `npm run db:start`  | Start the local Supabase containers              |
| `npm run db:stop`   | Stop the local Supabase containers               |
| `npm run db:status` | Print local service URLs and keys                |
| `npm run db:reset`  | Drop the local DB and re-run migrations + seeds  |

### Schema

Migrations in `supabase/migrations/` run on `db:start` and `db:reset`. The
`recipe_ratings` table lives in `supabase/seed.sql` so local and hosted
schemas stay in sync without a migration write.
