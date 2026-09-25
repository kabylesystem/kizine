import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

export const nutritionSources = sqliteTable("nutrition_sources", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  license: text("license").notNull(),
  url: text("url").notNull(),
  version: text("version").notNull(),
  importedAt: integer("imported_at").notNull().default(now),
});

export const foodConcepts = sqliteTable(
  "food_concepts",
  {
    id: text("id").primaryKey(),
    nameFr: text("name_fr").notNull(),
    nameEn: text("name_en").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    role: text("role").notNull(),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    defaultState: text("default_state").notNull().default("raw"),
    perishabilityDays: integer("perishability_days").notNull().default(30),
    perishabilityOpenDays: integer("perishability_open_days"),
    freezable: integer("freezable", { mode: "boolean" }).notNull().default(false),
    typicalPackageG: real("typical_package_g"),
    boughtByWeight: integer("bought_by_weight", { mode: "boolean" }).notNull().default(false),
    aisle: text("aisle").notNull().default("epicerie"),
    swipeable: integer("swipeable", { mode: "boolean" }).notNull().default(false),
    imageId: text("image_id"),
  },
  (t) => [index("fc_category_idx").on(t.category), index("fc_role_idx").on(t.role)],
);

export const foods = sqliteTable(
  "foods",
  {
    id: text("id").primaryKey(),
    conceptId: text("concept_id").notNull().references(() => foodConcepts.id),
    state: text("state").notNull(),
    cookingMethod: text("cooking_method"),
    label: text("label").notNull(),
    kcal100: real("kcal_100").notNull(),
    protein100: real("protein_100").notNull(),
    carb100: real("carb_100").notNull(),
    sugar100: real("sugar_100"),
    fat100: real("fat_100").notNull(),
    satFat100: real("sat_fat_100"),
    fiber100: real("fiber_100"),
    salt100: real("salt_100"),
    micros: text("micros", { mode: "json" }).$type<Record<string, number>>(),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    confidence: text("confidence"),
    basis: text("basis").notNull().default("per_100g"),
    fetchedAt: integer("fetched_at").notNull().default(now),
  },
  (t) => [
    index("food_concept_idx").on(t.conceptId),
    uniqueIndex("food_concept_state_idx").on(t.conceptId, t.state, t.cookingMethod),
  ],
);

export const yieldFactors = sqliteTable(
  "yield_factors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conceptId: text("concept_id").notNull().references(() => foodConcepts.id),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    method: text("method").notNull(),
    weightFactor: real("weight_factor").notNull(),
    source: text("source").notNull(),
    note: text("note"),
  },
  (t) => [uniqueIndex("yf_unique_idx").on(t.conceptId, t.fromState, t.toState, t.method)],
);

export const foodDensities = sqliteTable("food_densities", {
  conceptId: text("concept_id").primaryKey().references(() => foodConcepts.id),
  gPerMl: real("g_per_ml").notNull(),
  gPerTbsp: real("g_per_tbsp"),
  gPerTsp: real("g_per_tsp"),
  gPerUnit: real("g_per_unit"),
  unitLabel: text("unit_label"),
  source: text("source").notNull().default("manual"),
});

export const ingredientAliases = sqliteTable(
  "ingredient_aliases",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conceptId: text("concept_id").notNull().references(() => foodConcepts.id),
    rawText: text("raw_text").notNull(),
    normalized: text("normalized").notNull(),
    lang: text("lang").notNull().default("fr"),
    origin: text("origin").notNull().default("seed"),
    confidence: real("confidence").notNull().default(1),
  },
  (t) => [
    index("alias_norm_idx").on(t.normalized),
    uniqueIndex("alias_unique_idx").on(t.normalized, t.conceptId),
  ],
);

export const offProducts = sqliteTable(
  "off_products",
  {
    barcode: text("barcode").primaryKey(),
    conceptId: text("concept_id").references(() => foodConcepts.id),
    brand: text("brand"),
    name: text("name").notNull(),
    quantityG: real("quantity_g"),
    kcal100: real("kcal_100"),
    protein100: real("protein_100"),
    carb100: real("carb_100"),
    fat100: real("fat_100"),
    fiber100: real("fiber_100"),
    salt100: real("salt_100"),
    imageUrl: text("image_url"),
    raw: text("raw", { mode: "json" }),
    priceCents: integer("price_cents"),
    scanCount: integer("scan_count").notNull().default(0),
    lastScannedAt: integer("last_scanned_at"),
    /** default-user a validé l'aliment lui-même : ce lien fait autorité. */
    confirmed: integer("confirmed", { mode: "boolean" }).notNull().default(false),
    fetchedAt: integer("fetched_at").notNull().default(now),
  },
  (t) => [index("off_concept_idx").on(t.conceptId)],
);

export const recipes = sqliteTable(
  "recipes",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    titleEn: text("title_en"),
    cuisine: text("cuisine").notNull(),
    slotKinds: text("slot_kinds", { mode: "json" }).$type<string[]>().notNull(),
    flavorProfiles: text("flavor_profiles", { mode: "json" }).$type<string[]>().notNull().default([]),
    techniques: text("techniques", { mode: "json" }).$type<string[]>().notNull().default([]),
    textures: text("textures", { mode: "json" }).$type<string[]>().notNull().default([]),
    baseServings: integer("base_servings").notNull().default(1),
    activeMinutes: integer("active_minutes").notNull(),
    passiveMinutes: integer("passive_minutes").notNull().default(0),
    pansNeeded: integer("pans_needed").notNull().default(1),
    equipmentRequired: text("equipment_required", { mode: "json" }).$type<string[]>().notNull().default([]),
    difficulty: integer("difficulty").notNull().default(2),
    spiceLevel: integer("spice_level").notNull().default(0),
    leftoverToleranceDays: integer("leftover_tolerance_days").notNull().default(1),
    prepAheadable: integer("prep_aheadable", { mode: "boolean" }).notNull().default(false),
    portable: integer("portable", { mode: "boolean" }).notNull().default(false),
    goodCold: integer("good_cold", { mode: "boolean" }).notNull().default(false),
    reheatable: integer("reheatable", { mode: "boolean" }).notNull().default(true),
    kcalDensity: real("kcal_density"),
    sourceUrl: text("source_url"),
    imageId: text("image_id"),
    notes: text("notes"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("recipe_cuisine_idx").on(t.cuisine)],
);

export const recipeIngredients = sqliteTable(
  "recipe_ingredients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    conceptId: text("concept_id").notNull().references(() => foodConcepts.id),
    expectedState: text("expected_state").notNull().default("raw"),
    role: text("role").notNull(),
    refG: real("ref_g").notNull(),
    minG: real("min_g").notNull(),
    maxG: real("max_g").notNull(),
    adjustable: integer("adjustable", { mode: "boolean" }).notNull().default(true),
    stiffness: real("stiffness").notNull().default(1),
    optional: integer("optional", { mode: "boolean" }).notNull().default(false),
    note: text("note"),
  },
  (t) => [index("ri_recipe_idx").on(t.recipeId), index("ri_concept_idx").on(t.conceptId)],
);

export const recipeSteps = sqliteTable(
  "recipe_steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recipeId: text("recipe_id").notNull().references(() => recipes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    equipment: text("equipment"),
    timerSeconds: integer("timer_seconds"),
    isPrepAhead: integer("is_prep_ahead", { mode: "boolean" }).notNull().default(false),
    usesConceptIds: text("uses_concept_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
  },
  (t) => [index("rs_recipe_idx").on(t.recipeId)],
);

export const substitutions = sqliteTable("substitutions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  recipeId: text("recipe_id").references(() => recipes.id, { onDelete: "cascade" }),
  conceptId: text("concept_id").notNull().references(() => foodConcepts.id),
  replacementConceptId: text("replacement_concept_id").notNull().references(() => foodConcepts.id),
  ratio: real("ratio").notNull().default(1),
  qualityPenalty: real("quality_penalty").notNull().default(0.1),
  note: text("note"),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Nom affiché dans l'app, qui peut différer de l'identifiant technique. */
  displayName: text("display_name"),
  /** Empreinte scrypt du mot de passe. Jamais le mot de passe lui-même. */
  passwordHash: text("password_hash"),
  avatarPath: text("avatar_path"),
  /** Mot d'accueil, pour les comptes offerts. */
  greeting: text("greeting"),
  /** Quand la personne a lu l'écran d'accueil. Tant que c'est vide, on l'y renvoie. */
  welcomedAt: integer("welcomed_at"),
  /** Dernière note de version lue : tant qu'elle diffère de l'actuelle, on l'affiche. */
  seenRelease: text("seen_release"),
  createdAt: integer("created_at").notNull().default(now),
  onboardedAt: integer("onboarded_at"),
});

export const nutritionProfiles = sqliteTable("nutrition_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id),
  kcalTarget: real("kcal_target").notNull().default(3200),
  proteinTargetG: real("protein_target_g").notNull().default(170),
  fatMinG: real("fat_min_g").notNull().default(70),
  fiberMinG: real("fiber_min_g").notNull().default(30),
  dailyToleranceKcal: real("daily_tolerance_kcal").notNull().default(150),
  weeklyMode: integer("weekly_mode", { mode: "boolean" }).notNull().default(true),
  mealStructure: text("meal_structure", { mode: "json" })
    .$type<{ slot: string; kcalShare: number; proteinShare: number; label: string }[]>()
    .notNull(),
  weeklyBudgetEur: real("weekly_budget_eur"),
  cookMinutesWeekday: integer("cook_minutes_weekday").notNull().default(35),
  cookMinutesWeekend: integer("cook_minutes_weekend").notNull().default(60),
  maxPans: integer("max_pans").notNull().default(2),
  spiceTolerance: integer("spice_tolerance").notNull().default(2),
  leftoverTolerance: integer("leftover_tolerance").notNull().default(1),
  bulkBuyingOk: integer("bulk_buying_ok", { mode: "boolean" }).notNull().default(true),
  shoppingWeekday: integer("shopping_weekday").notNull().default(2),
  /** Jour où commence sa semaine : 0 dimanche, 1 lundi… Souvent le jour des courses. */
  weekStartsOn: integer("week_starts_on").notNull().default(1),
  secondShoppingWeekday: integer("second_shopping_weekday"),
  bodyWeightKg: real("body_weight_kg"),
  heightCm: real("height_cm"),
  ageYears: integer("age_years"),
  /** Combien de jours par semaine il prend un petit-déjeuner. Le reste part en 2 repas. */
  breakfastDaysPerWeek: integer("breakfast_days_per_week").notNull().default(7),
  /** Jours avec collation. À zéro, tout passe en deux ou trois vrais repas. */
  snackDaysPerWeek: integer("snack_days_per_week").notNull().default(7),
  bodyFatPct: real("body_fat_pct"),
  dailyLife: text("daily_life").notNull().default("mixed"),
  goalKind: text("goal_kind").notNull().default("bulkFast"),
  sex: text("sex").notNull().default("m"),
  /** Part de chaque repas dans la journée, choisie par la personne. NULL = parts par défaut du jour. */
  kcalSplit: text("kcal_split"),
  /** Activité hors sport seulement : les séances sont comptées une par une. */
  nonExerciseFactor: real("non_exercise_factor").notNull().default(1.35),
  proteinPerKg: real("protein_per_kg").notNull().default(2.1),
  /** Grammes de viande, poisson ou oeufs exigés sur un déjeuner et un dîner. */
  meatPerMainMealG: real("meat_per_main_meal_g").notNull().default(200),
  freezerLiters: real("freezer_liters").notNull().default(60),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const trainingSessions = sqliteTable(
  "training_sessions",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sportId: text("sport_id").notNull(),
    perWeek: integer("per_week").notNull(),
    minutes: integer("minutes").notNull(),
    /** Minutes par bloc d'une séance : échauffement, drill, sparring. */
    blockMinutes: text("block_minutes", { mode: "json" }).$type<Record<string, number>>(),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.sportId] })],
);

/** Trajets réguliers : le poste que tous les calculateurs oublient. */
export const commutes = sqliteTable("commutes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  km: real("km").notNull(),
  mode: text("mode").notNull(),
  tripsPerWeek: integer("trips_per_week").notNull(),
  /** Durée réelle d'un aller, quand il la connaît mieux que l'estimation. */
  minutesOneWay: integer("minutes_one_way"),
  updatedAt: integer("updated_at").notNull().default(now),
});

export const equipment = sqliteTable(
  "equipment",
  {
    userId: text("user_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    present: integer("present", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.kind] })],
);

export const preferences = sqliteTable(
  "preferences",
  {
    userId: text("user_id").notNull().references(() => users.id),
    conceptId: text("concept_id").notNull().references(() => foodConcepts.id),
    affinity: text("affinity").notNull(),
    affinityScore: real("affinity_score").notNull(),
    elo: real("elo"),
    frequencyPerWeek: real("frequency_per_week"),
    revealedScore: real("revealed_score"),
    exposures: integer("exposures").notNull().default(0),
    statedAt: integer("stated_at"),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.conceptId] })],
);

export const cuisinePreferences = sqliteTable(
  "cuisine_preferences",
  {
    userId: text("user_id").notNull().references(() => users.id),
    cuisine: text("cuisine").notNull(),
    elo: real("elo").notNull().default(1500),
    exposures: integer("exposures").notNull().default(0),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cuisine] })],
);

export const dishRatings = sqliteTable(
  "dish_ratings",
  {
    userId: text("user_id").notNull().references(() => users.id),
    recipeId: text("recipe_id").notNull().references(() => recipes.id),
    elo: real("elo").notNull().default(1500),
    duels: integer("duels").notNull().default(0),
    stated: real("stated"),
    revealed: real("revealed"),
    cookedCount: integer("cooked_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.recipeId] })],
);

export const swipeEvents = sqliteTable(
  "swipe_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().references(() => users.id),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    verdict: text("verdict").notNull(),
    ms: integer("ms"),
    round: text("round").notNull(),
    at: integer("at").notNull().default(now),
  },
  (t) => [index("swipe_user_idx").on(t.userId)],
);

export const duelEvents = sqliteTable("duel_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  leftId: text("left_id").notNull(),
  rightId: text("right_id").notNull(),
  winnerId: text("winner_id").notNull(),
  ms: integer("ms"),
  at: integer("at").notNull().default(now),
});

export const fatigueStates = sqliteTable(
  "fatigue_states",
  {
    userId: text("user_id").notNull().references(() => users.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    level: real("level").notNull().default(0),
    lastExposureAt: integer("last_exposure_at"),
    tauDays: real("tau_days").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.entityType, t.entityId] })],
);

export const mealPlans = sqliteTable(
  "meal_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    weekStart: text("week_start").notNull(),
    seed: integer("seed").notNull(),
    status: text("status").notNull().default("draft"),
    score: real("score"),
    scoreBreakdown: text("score_breakdown", { mode: "json" }),
    /** Courses faites : l'ensemble des plats est figé, on ne fait plus que permuter. */
    basketLockedAt: integer("basket_locked_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("plan_week_idx").on(t.userId, t.weekStart)],
);

export const mealSlots = sqliteTable(
  "meal_slots",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id").notNull().references(() => mealPlans.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    slot: text("slot").notNull(),
    label: text("label").notNull(),
    kcalTarget: real("kcal_target").notNull(),
    proteinTarget: real("protein_target").notNull(),
    maxMinutes: integer("max_minutes").notNull(),
    /** Le repas doit pouvoir se transporter et se manger sans cuisine. */
    portable: integer("portable", { mode: "boolean" }).notNull().default(false),
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("slot_plan_idx").on(t.planId)],
);

export const recipeInstances = sqliteTable("recipe_instances", {
  id: text("id").primaryKey(),
  recipeId: text("recipe_id").notNull().references(() => recipes.id),
  userId: text("user_id").notNull().references(() => users.id),
  grams: text("grams", { mode: "json" }).$type<Record<string, number>>().notNull(),
  kcal: real("kcal").notNull(),
  proteinG: real("protein_g").notNull(),
  carbG: real("carb_g").notNull(),
  fatG: real("fat_g").notNull(),
  fiberG: real("fiber_g"),
  costCents: integer("cost_cents"),
  solverStatus: text("solver_status").notNull(),
  /** Confiance sur ce qui a été mangé : exact (pesé), known (plat connu), rough (à la louche). */
  precision: text("precision"),
  solverTrace: text("solver_trace", { mode: "json" }),
  createdAt: integer("created_at").notNull().default(now),
});

export const meals = sqliteTable(
  "meals",
  {
    id: text("id").primaryKey(),
    slotId: text("slot_id").notNull().references(() => mealSlots.id, { onDelete: "cascade" }),
    recipeInstanceId: text("recipe_instance_id").notNull().references(() => recipeInstances.id),
    /** planned, approved, eating_out, cooked. */
    state: text("state").notNull().default("planned"),
    explanation: text("explanation", { mode: "json" }),
    /** Quand default-user a dit oui à ce plat, avant d'aller faire les courses. */
    approvedAt: integer("approved_at"),
    /** Pourquoi un repas prévu n'a pas été mangé : sauté, raté, pas eu le temps. */
    skipReason: text("skip_reason"),
    cookedAt: integer("cooked_at"),
  },
  (t) => [uniqueIndex("meal_slot_idx").on(t.slotId)],
);

export const cookingFeedback = sqliteTable("cooking_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mealId: text("meal_id").notNull().references(() => meals.id, { onDelete: "cascade" }),
  cooked: integer("cooked", { mode: "boolean" }),
  rating: integer("rating"),
  wouldRepeat: integer("would_repeat", { mode: "boolean" }),
  effort: text("effort"),
  portion: text("portion"),
  note: text("note"),
  at: integer("at").notNull().default(now),
});

export const storageLocations = sqliteTable("storage_locations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  capacityLiters: real("capacity_liters"),
});

export const pantryItems = sqliteTable(
  "pantry_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    locationId: text("location_id").notNull().references(() => storageLocations.id),
    conceptId: text("concept_id").notNull().references(() => foodConcepts.id),
    barcode: text("barcode"),
    quantityG: real("quantity_g").notNull(),
    initialG: real("initial_g").notNull(),
    openedAt: integer("opened_at"),
    purchasedAt: integer("purchased_at"),
    bestBefore: text("best_before"),
    frozen: integer("frozen", { mode: "boolean" }).notNull().default(false),
    portionedFromId: text("portioned_from_id"),
    confidence: real("confidence").notNull().default(1),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [index("pantry_concept_idx").on(t.conceptId), index("pantry_user_idx").on(t.userId)],
);

/** « je l'ai » / « je ne l'ai pas » dit en faisant les courses, pour les produits de placard. */
export const pantryDeclarations = sqliteTable(
  "pantry_declarations",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conceptId: text("concept_id").notNull().references(() => foodConcepts.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
    at: integer("at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.conceptId] })],
);

export const inventoryEvents = sqliteTable("inventory_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: text("item_id").notNull().references(() => pantryItems.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  deltaG: real("delta_g").notNull(),
  reasonRef: text("reason_ref"),
  at: integer("at").notNull().default(now),
});

export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  chain: text("chain"),
  city: text("city"),
  osmRef: text("osm_ref"),
});

export const groceryLists = sqliteTable("grocery_lists", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().references(() => mealPlans.id, { onDelete: "cascade" }),
  generatedAt: integer("generated_at").notNull().default(now),
  status: text("status").notNull().default("open"),
  estimatedCents: integer("estimated_cents"),
});

export const groceryListItems = sqliteTable(
  "grocery_list_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: text("list_id").notNull().references(() => groceryLists.id, { onDelete: "cascade" }),
    conceptId: text("concept_id").notNull().references(() => foodConcepts.id),
    neededG: real("needed_g").notNull(),
    fromPantryG: real("from_pantry_g").notNull().default(0),
    toBuyG: real("to_buy_g").notNull(),
    packageSizeG: real("package_size_g"),
    packages: integer("packages"),
    expectedLeftoverG: real("expected_leftover_g").notNull().default(0),
    estUnitCents: integer("est_unit_cents"),
    aisle: text("aisle").notNull(),
    checked: integer("checked", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("gli_list_idx").on(t.listId)],
);

export const purchases = sqliteTable("purchases", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  storeId: text("store_id").references(() => stores.id),
  at: integer("at").notNull().default(now),
  totalCents: integer("total_cents"),
  receiptId: text("receipt_id"),
});

export const purchaseItems = sqliteTable("purchase_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  purchaseId: text("purchase_id").notNull().references(() => purchases.id, { onDelete: "cascade" }),
  conceptId: text("concept_id").references(() => foodConcepts.id),
  barcode: text("barcode"),
  rawLabel: text("raw_label"),
  quantityG: real("quantity_g"),
  priceCents: integer("price_cents").notNull(),
  discountCents: integer("discount_cents").notNull().default(0),
  matchedListItemId: integer("matched_list_item_id"),
  matchConfidence: real("match_confidence"),
});

export const priceObservations = sqliteTable(
  "price_observations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conceptId: text("concept_id").notNull().references(() => foodConcepts.id),
    barcode: text("barcode"),
    storeId: text("store_id").references(() => stores.id),
    priceCents: integer("price_cents").notNull(),
    quantityG: real("quantity_g").notNull(),
    centsPerKg: real("cents_per_kg").notNull(),
    at: integer("at").notNull().default(now),
    source: text("source").notNull(),
  },
  (t) => [index("price_concept_idx").on(t.conceptId)],
);

export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  storeId: text("store_id").references(() => stores.id),
  imagePath: text("image_path").notNull(),
  parsed: text("parsed", { mode: "json" }),
  totalCents: integer("total_cents"),
  status: text("status").notNull().default("pending"),
  at: integer("at").notNull().default(now),
});

export const imageAssets = sqliteTable("image_assets", {
  id: text("id").primaryKey(),
  path: text("path").notNull(),
  width: integer("width"),
  height: integer("height"),
  source: text("source").notNull(),
  license: text("license"),
  attribution: text("attribution"),
  sourceUrl: text("source_url"),
  dominant: text("dominant"),
});

/**
 * Rythme de vie : une ligne par jour de la semaine.
 * C'est ce qui décide combien de repas, combien de temps de cuisine,
 * et si le repas doit pouvoir se transporter et se manger froid.
 */
export const dayProfiles = sqliteTable(
  "day_profiles",
  {
    userId: text("user_id").notNull().references(() => users.id),
    weekday: integer("weekday").notNull(),
    label: text("label").notNull(),
    context: text("context").notNull(),
    cookMinutesEvening: integer("cook_minutes_evening").notNull(),
    cookMinutesMidday: integer("cook_minutes_midday").notNull(),
    mealSlots: text("meal_slots", { mode: "json" })
      .$type<{ slot: string; label: string; kcalShare: number; proteinShare: number; portable: boolean; maxMinutes: number }[]>()
      .notNull(),
    trainingTime: text("training_time"),
    notes: text("notes"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.weekday] })],
);

/** Exceptions ponctuelles : un jour qui ne suit pas le rythme habituel. */
/** Décision ponctuelle sur un jour précis, qui prime sur le réglage général. */
export const dayOverrides = sqliteTable(
  "day_overrides",
  {
    userId: text("user_id").notNull().references(() => users.id),
    date: text("date").notNull(),
    context: text("context").notNull(),
    cookMinutesEvening: integer("cook_minutes_evening"),
    mealSlots: text("meal_slots", { mode: "json" }),
    /** Ce jour-là, pas de collation, quel que soit le réglage général. */
    noSnack: integer("no_snack", { mode: "boolean" }).notNull().default(false),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

export const weightLogs = sqliteTable(
  "weight_logs",
  {
    userId: text("user_id").notNull().references(() => users.id),
    date: text("date").notNull(),
    kg: real("kg").notNull(),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.date] })],
);

/**
 * Plat cuisiné hors plan (batch du dimanche, inspiration du rayon) : compté à la
 * louche à partir de ses ingrédients, découpé en portions qu'on pose sur les
 * repas de la semaine. Porté par une recette fantôme désactivée, pour que Today,
 * Week et les stats le traitent comme n'importe quel repas.
 */
export const freeDishes = sqliteTable(
  "free_dishes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    recipeId: text("recipe_id").notNull().references(() => recipes.id),
    title: text("title").notNull(),
    totalG: real("total_g").notNull(),
    portions: integer("portions").notNull(),
    portionG: real("portion_g").notNull(),
    kcal: real("kcal").notNull(),
    proteinG: real("protein_g").notNull(),
    carbG: real("carb_g").notNull(),
    fatG: real("fat_g").notNull(),
    fiberG: real("fiber_g").notNull(),
    ingredients: text("ingredients", { mode: "json" })
      .$type<{ key: string; label: string; grams: number; kcal: number; protein: number }[]>()
      .notNull(),
    stockTaken: integer("stock_taken", { mode: "boolean" }).notNull().default(false),
    /** known (plat connu, ±15 %) ou rough (à la louche, ±30 %) ; NULL = déduit des ingrédients. */
    precision: text("precision"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("free_user_idx").on(t.userId)],
);

export const goals = sqliteTable("goals", {
  // Défini avant de choisir les plats : ça fixe le nombre de repas à trouver.
  userId: text("user_id").primaryKey().references(() => users.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  startKg: real("start_kg").notNull(),
  targetKg: real("target_kg").notNull(),
  targetGainKgPerWeek: real("target_gain_kg_per_week").notNull(),
  trainingDaysPerWeek: integer("training_days_per_week").notNull().default(7),
  aggressiveness: text("aggressiveness").notNull().default("aggressive"),
  updatedAt: integer("updated_at").notNull().default(now),
});
