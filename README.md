# WOD Tracker

A clean, modern web app for posting daily CrossFit-style WODs, structured multi-week training plans, logging results, and leaderboards.

Built with **Next.js 15 + Supabase + Tailwind CSS**.

## Features

### Daily WODs
- Admin-only posting of daily workouts (for time, AMRAP, EMOM, strength, etc.)
- Public viewing
- Result logging: time, AMRAP rounds+reps, weight, Rx/Scaled
- Leaderboards (logged-in users)

### Training Plans (new)
- Create structured multi-week programs (ACFT Improvement, Strength + 5k, Raw Power, etc.)
- Add sessions by week/day with full workout content
- Users can browse plans and **Start This Plan**
- Progress tracking (completed sessions + % bar)
- Log results against individual plan sessions
- Active plans shown on the home page

### Other
- Exercise library with YouTube/Vimeo how-to embeds
- Personal profile with result history
- Dark, mobile-friendly UI

## Setup (≈ 15 minutes)

### 1. Create a free Supabase project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Copy your **Project URL** and **anon public key** (Settings → API)

### 2. Run the database schema
1. In Supabase → SQL Editor → New query
2. Paste the entire contents of `supabase/schema.sql`
3. Run it

### 3. Make yourself admin
After you create an account in the app:
```sql
update public.profiles set is_admin = true where email = 'your-email@example.com';
```

### 4. Configure the app
```bash
cp .env.local.example .env.local
```
Edit `.env.local` and paste your Supabase URL + anon key.

### 5. Install & run
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

### 6. Deploy (free)
1. Push the repo to GitHub
2. Import into [Vercel](https://vercel.com)
3. Add the two environment variables
4. Deploy

## Creating a Training Plan (Admin)

1. Go to **Admin → Create / Edit Plans**
2. Fill in title, goal, description, duration, difficulty, tags
3. Add sessions one by one (week, day, title, workout content)
4. Publish when ready
5. Users will see it under **Plans** and can start following it

## Project Structure

```
src/
  app/
    page.tsx              # Today's WOD + active plans
    plans/                # Browse + detail + progress
    admin/                # Daily WODs + Exercises + Plans
    workouts/             # History
    exercises/            # Video library
    leaderboard/
    profile/
    auth/
  components/
  lib/supabase/
  types/
supabase/
  schema.sql              # Full schema including training plans
```

Enjoy the WODs and programs! 💪
