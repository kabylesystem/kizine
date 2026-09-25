const LABELS: Record<string, string> = {
  // Bols, tartines, smoothies : de l'assemblage, pas une tradition culinaire.
  everyday: "No cuisine",
  "north-african": "North African",
  "west-african": "West African",
  kabyle: "Kabyle",
  levantine: "Levantine",
  french: "French",
  italian: "Italian",
  american: "American",
  indian: "Indian",
  japanese: "Japanese",
  thai: "Thai",
  mexican: "Mexican",
  korean: "Korean",
  greek: "Greek",
  chinese: "Chinese",
  spanish: "Spanish",
  vietnamese: "Vietnamese",
  turkish: "Turkish",
  nordic: "Nordic",
  portuguese: "Portuguese",
};

export const cuisineLabel = (slug: string) =>
  LABELS[slug] ?? slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
