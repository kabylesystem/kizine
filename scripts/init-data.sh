#!/usr/bin/env sh
set -eu
mkdir -p data/raw public/food public/dish
tar -xzf third_party/ciqual-2020-xml.tar.gz -C data/raw
npx tsx scripts/etl-ciqual.ts
npx tsx scripts/seed-recipes.ts
npx tsx scripts/seed-units.ts
