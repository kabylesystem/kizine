/**
 * Ce qu'il faut chercher des yeux en rayon, en français de supermarché.
 * « Fish sauce » ou « dried apricot » ne veulent rien dire devant une gondole :
 * ici on donne le nom écrit sur le paquet, le rayon, et le piège à éviter.
 * Uniquement les produits réellement ambigus : le reste se trouve tout seul.
 */
export interface ShelfTip {
  /** Le nom tel qu'il est imprimé sur l'emballage. */
  onPack: string;
  /** Où le chercher, en clair. */
  where: string;
  /** Ce qui fait rater l'achat : le piège précis. */
  watch?: string;
}

export const SHELF_TIPS: Record<string, ShelfTip> = {
  "fish-sauce": {
    onPack: "Nuoc-mâm",
    where: "rayon monde, allée asiatique, petite bouteille brune",
    watch: "vise 100 % anchois et sel, pas une sauce déjà sucrée",
  },
  "soy-sauce": {
    onPack: "Sauce soja salée",
    where: "rayon monde, allée asiatique",
    watch: "prends la salée, pas la sucrée pour nems",
  },
  "dried-apricot": {
    onPack: "Abricots secs",
    where: "épicerie, rayon fruits secs, à côté des dattes",
    watch: "abricots seuls, pas un mélange fruits secs et noix",
  },
  raisins: {
    onPack: "Raisins secs",
    where: "épicerie, rayon fruits secs",
    watch: "sultanines ou golden, peu importe",
  },
  passata: {
    onPack: "Purée de tomates ou coulis de tomates",
    where: "conserves, à côté des tomates pelées",
    watch: "pas du concentré, qui est bien plus épais et en petit tube",
  },
  "tomato-paste": {
    onPack: "Concentré de tomates",
    where: "conserves, petit tube ou petite boîte",
  },
  "tomato-canned": {
    onPack: "Tomates concassées ou pelées",
    where: "conserves",
  },
  "stock-cube": {
    onPack: "Bouillon cube (volaille ou légumes)",
    where: "épicerie, rayon aides culinaires",
    watch: "un cube, pas un fond de sauce en pot",
  },
  "herbes-provence": { onPack: "Herbes de Provence", where: "épicerie, rayon épices" },
  "smoked-paprika": {
    onPack: "Paprika fumé",
    where: "épicerie, rayon épices, souvent en boîte espagnole",
    watch: "le paprika normal ne donnera pas le même goût",
  },
  "ras-el-hanout": { onPack: "Ras el hanout", where: "rayon monde ou épices" },
  harissa: {
    onPack: "Harissa",
    where: "rayon monde, tube ou petit pot",
    watch: "le tube est plus fort que le pot",
  },
  "chili-flakes": { onPack: "Piment en flocons ou piment d'Espelette", where: "épicerie, rayon épices" },
  "curry-powder": { onPack: "Curry en poudre", where: "épicerie, rayon épices" },
  "garam-masala": { onPack: "Garam masala", where: "rayon monde, allée indienne" },
  "curry-paste": {
    onPack: "Pâte de curry (rouge ou verte)",
    where: "rayon monde, allée thaï, petit pot",
  },
  gochujang: { onPack: "Gochujang, pâte de piment coréenne", where: "rayon monde, allée asiatique" },
  miso: { onPack: "Pâte miso", where: "rayon monde ou bio, au frais parfois" },
  tahini: {
    onPack: "Tahini ou purée de sésame",
    where: "rayon monde ou bio",
    watch: "purée de sésame nature, pas la version sucrée",
  },
  "coconut-milk": {
    onPack: "Lait de coco",
    where: "rayon monde, allée asiatique, brique ou boîte",
    watch: "lait, pas crème ni boisson végétale à la noix de coco",
  },
  balsamic: { onPack: "Vinaigre balsamique", where: "épicerie, rayon huiles et vinaigres" },
  "vinegar-cider": { onPack: "Vinaigre de cidre", where: "épicerie, rayon huiles et vinaigres" },
  "rapeseed-oil": { onPack: "Huile de colza", where: "épicerie, rayon huiles" },
  "sesame-oil": {
    onPack: "Huile de sésame grillé",
    where: "rayon monde, petite bouteille",
    watch: "la grillée est brune et parfumée, c'est celle-là",
  },
  "fromage-blanc": {
    onPack: "Fromage blanc nature",
    where: "rayon frais, à côté des yaourts",
    watch: "nature, pas aux fruits, et regarde le taux de matière grasse",
  },
  skyr: { onPack: "Skyr nature", where: "rayon frais, avec les yaourts protéinés" },
  "greek-yogurt": {
    onPack: "Yaourt à la grecque",
    where: "rayon frais",
    watch: "à la grecque, pas « façon grecque » sucré",
  },
  "cottage-cheese": { onPack: "Cottage cheese ou fromage cottage", where: "rayon frais, souvent en petit pot" },
  "creme-fraiche": { onPack: "Crème fraîche épaisse", where: "rayon frais" },
  comte: { onPack: "Comté", where: "rayon fromage à la coupe ou libre-service" },
  "goat-cheese": { onPack: "Bûche de chèvre", where: "rayon fromage" },
  "beef-mince-5": {
    onPack: "Steak haché 5 % de matière grasse",
    where: "boucherie ou barquettes en libre-service",
    watch: "le chiffre 5 % est écrit gros sur la barquette",
  },
  "beef-mince-15": { onPack: "Steak haché 15 %", where: "boucherie ou libre-service" },
  "beef-braising": {
    onPack: "Bœuf à braiser (paleron, macreuse, gîte)",
    where: "boucherie",
    watch: "morceau à mijoter, pas un steak à griller",
  },
  "pork-loin": { onPack: "Filet mignon ou longe de porc", where: "boucherie" },
  lardons: { onPack: "Lardons fumés", where: "rayon charcuterie libre-service" },
  "turkey-escalope": { onPack: "Escalopes de dinde", where: "boucherie volaille" },
  "duck-breast": { onPack: "Magret de canard", where: "boucherie volaille, sous vide" },
  "chicken-thigh": {
    onPack: "Hauts de cuisse de poulet",
    where: "boucherie volaille",
    watch: "avec ou sans os, dis-toi que sans os c'est plus rapide",
  },
  "white-fish": {
    onPack: "Filets de poisson blanc (colin, lieu, merlu)",
    where: "poissonnerie ou surgelés",
  },
  cod: { onPack: "Dos ou filet de cabillaud", where: "poissonnerie ou surgelés" },
  "salmon-smoked": { onPack: "Saumon fumé", where: "rayon frais, à côté du traiteur" },
  "mackerel-canned": { onPack: "Maquereaux (au naturel ou à l'huile)", where: "conserves poisson" },
  "sardines-canned": { onPack: "Sardines à l'huile", where: "conserves poisson" },
  "tuna-canned": {
    onPack: "Thon au naturel",
    where: "conserves poisson",
    watch: "au naturel, pas à l'huile, sinon les calories changent",
  },
  "chickpeas-canned": {
    onPack: "Pois chiches (bocal ou boîte)",
    where: "conserves légumes",
    watch: "égoutte et rince, le poids affiché inclut le jus",
  },
  "white-beans": { onPack: "Haricots blancs", where: "conserves légumes" },
  "red-beans": { onPack: "Haricots rouges", where: "conserves légumes" },
  "black-beans": { onPack: "Haricots noirs", where: "conserves ou rayon monde" },
  "lentils-green": { onPack: "Lentilles vertes", where: "épicerie, rayon légumes secs" },
  "lentils-red": { onPack: "Lentilles corail", where: "épicerie, rayon légumes secs" },
  "tofu-firm": { onPack: "Tofu ferme nature", where: "rayon frais bio" },
  "tofu-smoked": { onPack: "Tofu fumé", where: "rayon frais bio" },
  "semolina-fine": {
    onPack: "Semoule de blé dur fine",
    where: "épicerie, rayon pâtes et riz",
    watch: "pas la semoule de couscous, qui est plus grosse",
  },
  couscous: { onPack: "Graine de couscous moyenne", where: "épicerie, rayon pâtes et riz" },
  bulgur: { onPack: "Boulgour", where: "épicerie, rayon pâtes et riz" },
  polenta: { onPack: "Polenta", where: "épicerie, rayon pâtes et riz" },
  "rice-noodles": { onPack: "Nouilles de riz", where: "rayon monde, allée asiatique" },
  "noodles-wheat": { onPack: "Nouilles chinoises au blé", where: "rayon monde, allée asiatique" },
  "tortilla-corn": { onPack: "Tortillas de maïs", where: "rayon monde, allée mexicaine" },
  "tortilla-wheat": { onPack: "Tortillas de blé", where: "rayon monde, allée mexicaine" },
  "bread-sandwich": { onPack: "Pain de mie complet", where: "boulangerie libre-service" },
  breadcrumbs: { onPack: "Chapelure", where: "épicerie, rayon aides culinaires" },
  granola: {
    onPack: "Granola ou muesli croustillant",
    where: "épicerie, rayon petit-déjeuner",
    watch: "regarde le sucre, ça monte vite",
  },
  oats: {
    onPack: "Flocons d'avoine",
    where: "épicerie, rayon petit-déjeuner ou bio",
    watch: "flocons, pas de la farine d'avoine",
  },
  "peanut-butter": {
    onPack: "Beurre de cacahuète",
    where: "épicerie, rayon petit-déjeuner",
    watch: "100 % cacahuètes si possible, sinon c'est sucré",
  },
  "pine-nuts": { onPack: "Pignons de pin", where: "épicerie, rayon fruits secs, petit sachet" },
  "pumpkin-seeds": { onPack: "Graines de courge", where: "épicerie, rayon graines ou bio" },
  chia: { onPack: "Graines de chia", where: "rayon bio" },
  "olives-green": { onPack: "Olives vertes dénoyautées", where: "rayon apéritif ou conserves" },
  "olives-black": { onPack: "Olives noires dénoyautées", where: "rayon apéritif ou conserves" },
  "cherry-tomato": { onPack: "Tomates cerises", where: "primeur, en barquette" },
  "ginger-fresh": { onPack: "Gingembre frais", where: "primeur, à côté de l'ail" },
  "coriander-fresh": {
    onPack: "Coriandre fraîche",
    where: "primeur, herbes fraîches",
    watch: "coriandre, pas persil plat : les feuilles sont plus rondes",
  },
  parsley: { onPack: "Persil plat", where: "primeur, herbes fraîches" },
  "red-onion": { onPack: "Oignon rouge", where: "primeur" },
  shallot: { onPack: "Échalotes", where: "primeur" },
  butternut: { onPack: "Courge butternut", where: "primeur, saison automne" },
  fennel: { onPack: "Fenouil", where: "primeur" },
  "maple-syrup": { onPack: "Sirop d'érable", where: "épicerie, rayon petit-déjeuner" },
  sriracha: { onPack: "Sauce sriracha", where: "rayon monde, bouteille rouge" },
  pesto: { onPack: "Pesto alla genovese", where: "épicerie, rayon pâtes, en bocal" },
  "whey-protein": { onPack: "Whey protéine", where: "magasin de sport ou rayon diététique" },
};
