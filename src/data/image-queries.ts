/**
 * Requête Commons par carte du deck, décrivant l'aliment TEL QU'ON L'ACHÈTE.
 * Le scoreur (scripts/pick-images.ts) écarte ensuite les gravures de musée,
 * les étals de marché, les plats cuisinés et les photos avec des gens dedans.
 */
export const imageQueries: Record<string, string> = {
  "chicken-breast": "chicken breast raw meat", "chicken-thigh": "raw chicken thighs",
  "turkey-escalope": "raw turkey breast slices", "beef-steak": "raw beef steak",
  "beef-mince-15": "raw minced beef", "beef-braising": "raw beef cubes stew",
  "lamb-shoulder": "raw lamb shoulder meat", "lamb-chops": "raw lamb chops",
  merguez: "merguez sausages raw", "pork-loin": "raw pork tenderloin",
  ham: "sliced cooked ham", lardons: "diced bacon lardons", chorizo: "chorizo sausage sliced",
  "duck-breast": "raw duck breast magret", salmon: "raw salmon fillet",
  "salmon-smoked": "smoked salmon slices", "tuna-canned": "canned tuna bowl",
  cod: "raw cod fillet", "sardines-canned": "canned sardines tin",
  shrimp: "raw peeled prawns", mussels: "fresh mussels bowl", egg: "chicken eggs white background",
  "tofu-firm": "firm tofu block", "lentils-green": "dry green lentils",
  "chickpeas-canned": "chickpeas seeds", "red-beans": "dry red kidney beans",

  "rice-basmati": "basmati rice grains", "rice-brown": "brown rice grains",
  pasta: "dry penne pasta", "noodles-wheat": "dried wheat noodles",
  potato: "raw potatoes", "sweet-potato": "raw sweet potatoes",
  couscous: "couscous semolina grains", bulgur: "bulgur wheat bowl", quinoa: "quinoa grains bowl",
  oats: "rolled oats bowl", "bread-baguette": "french baguette bread",
  "bread-wholegrain": "wholemeal bread loaf sliced", "tortilla-wheat": "flour tortillas stack",
  pita: "pita bread", granola: "granola bowl",

  onion: "onions", garlic: "garlic bulbs cloves", tomato: "fresh tomatoes",
  courgette: "zucchini courgettes", aubergine: "aubergine eggplant vegetable",
  "bell-pepper": "bell peppers", carrot: "carrots", broccoli: "broccoli florets",
  cauliflower: "cauliflower head", spinach: "fresh spinach leaves bowl",
  "green-beans": "green beans", peas: "green peas bowl", mushroom: "button mushrooms",
  leek: "leeks", cucumber: "cucumbers", lettuce: "lettuce head",
  butternut: "butternut squash", "olives-black": "black olives bowl",
  "coriander-fresh": "fresh coriander cilantro bunch", mint: "fresh mint leaves bunch",

  banana: "bananas", apple: "apples", orange: "oranges fruit",
  strawberry: "strawberries", blueberry: "blueberries bowl", mango: "mango fruit",
  grapes: "grapes bunch", avocado: "avocado halved", dates: "medjool dates fruit",

  "greek-yogurt": "greek yogurt bowl", skyr: "skyr yogurt bowl",
  "fromage-blanc": "fromage blanc bowl", "milk-semi": "glass of milk",
  "cream-liquid": "pouring cream jug", butter: "butter block",
  mozzarella: "mozzarella ball", feta: "feta cheese block", parmesan: "parmesan cheese wedge",
  cheddar: "cheddar cheese block",

  "olive-oil": "olive oil bottle glass", "peanut-butter": "peanut butter jar",
  tahini: "tahini sesame paste bowl", almonds: "almonds bowl", peanuts: "shelled peanuts",

  harissa: "harissa paste bowl", sriracha: "sriracha chilli sauce",
  gochujang: "gochujang paste bowl", "soy-sauce": "soy sauce bowl",
  "coconut-milk": "coconut milk bowl", mustard: "dijon mustard jar",
  pesto: "pesto sauce bowl", honey: "honey jar", "dark-chocolate": "dark chocolate bar",
};
