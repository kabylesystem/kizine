/**
 * Ce qui a changé, dit une fois à l'ouverture, puis plus jamais. Une seule
 * version à la fois : la dernière. Bump la date à chaque livraison visible.
 */
export const CURRENT_RELEASE = "2026-09-04";

export const RELEASE = {
  date: { en: "4 September", fr: "4 septembre" },
  title: { en: "What changed", fr: "Ce qui a changé" },
  intro: {
    en: "One question drove this update: at the end of the day, did I eat right for my goal, even without weighing everything?",
    fr: "Une question a guidé cette mise à jour : le soir, est-ce que j'ai mangé juste pour mon objectif, même sans tout peser ?",
  },
  items: [
    {
      en: "Today now answers that in one sentence. Every meal can be logged the way you like: cooked and weighed, eaten as planned with a tap, a batch portion, a product, or a rough « big meal ». It all lands in the same day, each with its own confidence.",
      fr: "Today répond en une phrase. Chaque repas se note comme tu veux : cuisiné et pesé, mangé tel quel d'un tap, une portion de batch, un produit, ou un « gros repas » à la louche. Tout atterrit dans la même journée, chacun avec sa confiance.",
    },
    {
      en: "A photo of the plate, its name and its weight: the picture is read on the box, your own food database does the maths, and you can correct any line before adding it. Weighed plate ±15 %, no weight ±30 %.",
      fr: "Une photo de l'assiette, son nom et son poids : la photo est lue sur la box, ta propre base d'aliments fait le calcul, et tu corriges chaque ligne avant d'ajouter. Assiette pesée ±15 %, sans poids ±30 %.",
    },
    {
      en: "Cooked a pot on Sunday? « I cooked a pot » counts it roughly from its ingredients and spreads the portions over the week. The rest of each day re-sizes itself around it.",
      fr: "Une marmite le dimanche ? « J'ai fait une marmite » la compte à la louche depuis ses ingrédients et étale les portions sur la semaine. Le reste de chaque jour se recale autour.",
    },
    {
      en: "Losing fat, holding steady or building muscle: the goal now shapes the verdict, the protein target and the onboarding. Woman or man, too. Settings lets you split calories across breakfast, lunch, snack and dinner.",
      fr: "Perdre du gras, se maintenir ou prendre du muscle : l'objectif guide maintenant le verdict, la cible de protéines et l'onboarding. Femme ou homme, aussi. Les paramètres permettent de répartir les calories entre petit-déj, déjeuner, collation et dîner.",
    },
    {
      en: "Smaller things: Lunch and Dinner tags when you approve the week, a dish ×2 or ×3, the cupboard buttons work, one pork card instead of four, chakhchoukha is North African.",
      fr: "Plus petit : étiquettes Déjeuner et Dîner à la validation, un plat ×2 ou ×3, les boutons du placard marchent, une seule carte porc, la chakhchoukha est nord-africaine.",
    },
  ],
} as const;
