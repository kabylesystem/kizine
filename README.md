# Kizine

A kitchen planner that answers a daily question: **what should I cook tonight?** Kizine combines food preferences, a weekly plan, shopping, pantry stock and cooking instructions. When a meal changes, it can rebalance the rest of the week.

The complete application code is here. Personal accounts, nutrition profiles and meal history are not included.

## What it does

- Builds a meal plan from preferences, schedule, nutrition targets and available ingredients.
- Turns the plan into a shopping list and tracks pantry, fridge and freezer stock.
- Runs a focused cook mode with quantities, steps and timers.
- Adapts the plan when you skip, replace or eat a meal elsewhere.
- Keeps account data in SQLite locally or libSQL/Turso in deployment.

## Stack

Next.js 16, React 19, TypeScript, Tailwind CSS, Drizzle ORM, libSQL/SQLite and the HiGHS optimization solver. Nutrition references use the ANSES Ciqual 2020 dataset (open license; source and attribution in `third_party/README.md`); optional food images are sourced through the scripts under `scripts/`.

## Run locally

```bash
npm ci
mkdir -p data public/food public/dish
cp .env.example .env.local
npm run seed
npm run dev
```

The app runs at `http://localhost:4310`. With no remote database configured, it uses `data/cuisine.sqlite`. Set `SESSION_SECRET` and account credentials before exposing an instance to the internet. `.env*`, `data/` and generated images are ignored by Git.

Food photography is **not included** in this repository: the upstream sources have their own licenses and attribution requirements. Image fetching scripts record source and attribution in the `image_assets` table. The app can run without the images.

## Source layout

- `app/` — pages and API routes
- `src/core/` — planning and nutrition logic
- `src/server/` — application services and account handling
- `src/data/` — generic foods and recipes
- `src/db/` and `drizzle/` — storage and migrations
- `scripts/` — dataset and image preparation

The code is MIT licensed. Third-party datasets, images and bundled HiGHS assets keep their respective licenses.
