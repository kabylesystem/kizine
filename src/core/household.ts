import type { ConceptMeta } from "./planner-types";

const PLURAL: Record<string, string> = {
  head: "heads",
  bunch: "bunches",
  bulb: "bulbs",
  punnet: "punnets",
  tin: "tins",
  jar: "jars",
  bag: "bags",
  pot: "pots",
  block: "blocks",
  knob: "knobs",
  bottle: "bottles",
  squash: "squashes",
  pack: "packs",
  escalope: "escalopes",
  chop: "chops",
  breast: "breasts",
  beetroot: "beetroots",
  cabbage: "cabbages",
  melon: "melons",
  pineapple: "pineapples",
  pomegranate: "pomegranates",
  fig: "figs",
  fillet: "fillets",
  thigh: "thighs",
  drumstick: "drumsticks",
  steak: "steaks",
  merguez: "merguez",
  slice: "slices",
  egg: "eggs",
  potato: "potatoes",
  "sweet potato": "sweet potatoes",
  tortilla: "tortillas",
  pita: "pitas",
  onion: "onions",
  shallot: "shallots",
  clove: "cloves",
  tomato: "tomatoes",
  courgette: "courgettes",
  aubergine: "aubergines",
  pepper: "peppers",
  carrot: "carrots",
  leek: "leeks",
  cucumber: "cucumbers",
  banana: "bananas",
  apple: "apples",
  orange: "oranges",
  clementine: "clementines",
  mango: "mangoes",
  kiwi: "kiwis",
  pear: "pears",
  peach: "peaches",
  date: "dates",
  avocado: "avocados",
  lemon: "lemons",
  lime: "limes",
  cube: "cubes",
  leaf: "leaves",
};

const plural = (label: string, n: number) => (n <= 1 ? label : PLURAL[label] ?? `${label}s`);

/** Les mêmes unités en français, pour que l'indice suive le nom de l'aliment. */
const FR: Record<string, [string, string]> = {
  fillet: ["filet", "filets"],
  thigh: ["haut de cuisse", "hauts de cuisse"],
  drumstick: ["pilon", "pilons"],
  steak: ["steak", "steaks"],
  merguez: ["merguez", "merguez"],
  slice: ["tranche", "tranches"],
  egg: ["oeuf", "oeufs"],
  potato: ["pomme de terre", "pommes de terre"],
  "sweet potato": ["patate douce", "patates douces"],
  tortilla: ["tortilla", "tortillas"],
  pita: ["pita", "pitas"],
  onion: ["oignon", "oignons"],
  shallot: ["échalote", "échalotes"],
  clove: ["gousse", "gousses"],
  tomato: ["tomate", "tomates"],
  courgette: ["courgette", "courgettes"],
  aubergine: ["aubergine", "aubergines"],
  pepper: ["poivron", "poivrons"],
  carrot: ["carotte", "carottes"],
  leek: ["poireau", "poireaux"],
  cucumber: ["concombre", "concombres"],
  banana: ["banane", "bananes"],
  apple: ["pomme", "pommes"],
  orange: ["orange", "oranges"],
  clementine: ["clémentine", "clémentines"],
  mango: ["mangue", "mangues"],
  kiwi: ["kiwi", "kiwis"],
  pear: ["poire", "poires"],
  peach: ["pêche", "pêches"],
  date: ["datte", "dattes"],
  avocado: ["avocat", "avocats"],
  lemon: ["citron", "citrons"],
  lime: ["citron vert", "citrons verts"],
  pot: ["pot", "pots"],
  cube: ["cube", "cubes"],
  leaf: ["feuille", "feuilles"],
  head: ["tête", "têtes"],
  bunch: ["botte", "bottes"],
  bulb: ["bulbe", "bulbes"],
  punnet: ["barquette", "barquettes"],
  tin: ["boîte", "boîtes"],
  jar: ["bocal", "bocaux"],
  bag: ["sachet", "sachets"],
  block: ["bloc", "blocs"],
  knob: ["morceau", "morceaux"],
  bottle: ["bouteille", "bouteilles"],
  squash: ["courge", "courges"],
  pack: ["paquet", "paquets"],
  escalope: ["escalope", "escalopes"],
  chop: ["côtelette", "côtelettes"],
  breast: ["magret", "magrets"],
  beetroot: ["betterave", "betteraves"],
  cabbage: ["chou", "choux"],
  melon: ["melon", "melons"],
  pineapple: ["ananas", "ananas"],
  pomegranate: ["grenade", "grenades"],
  fig: ["figue", "figues"],
};

const unit = (label: string, n: number, lang: "en" | "fr") => {
  if (lang !== "fr") return plural(label, n);
  const pair = FR[label];
  return pair ? (n <= 1 ? pair[0] : pair[1]) : plural(label, n);
};

/**
 * En rayon on ne pèse pas : on compte. « 660 g » devient « about 5 carrots »,
 * « 400 g » devient « 1 tin ». Rien d'inventé : le poids de la pièce vient
 * de food_densities, la taille du paquet de food_concepts.
 */
export function shoppingHint(
  grams: number,
  meta: ConceptMeta | undefined,
  lang: "en" | "fr" = "en",
): string | null {
  if (!meta || grams <= 0) return null;
  const about = lang === "fr" ? "environ" : "about";

  if (meta.gPerUnit && meta.unitLabel) {
    const n = grams / meta.gPerUnit;
    if (n < 0.35) return null;
    const rounded = n < 1 ? 1 : Math.round(n);
    return `${about} ${rounded} ${unit(meta.unitLabel, rounded, lang)}`;
  }

  // Vendu au poids : la balance du rayon fait le travail, un compte n'aiderait pas.
  if (meta.boughtByWeight) return null;

  if (meta.packageG) {
    const n = grams / meta.packageG;
    if (n < 0.35) return null;
    const rounded = n < 1 ? 1 : Math.round(n);
    const size = meta.packageG >= 1000 ? `${meta.packageG / 1000} kg` : `${meta.packageG} g`;
    const of = lang === "fr" ? "de" : "of";
    return `${about} ${rounded} ${unit("pack", rounded, lang)} ${of} ${size}`;
  }

  return null;
}
