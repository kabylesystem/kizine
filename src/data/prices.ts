/**
 * Prix de référence en euros par kilo, supermarché français, marque distributeur, 2026.
 * Ce ne sont que des amorces : chaque achat réel de default-user crée une observation
 * qui prend le dessus. C'est ce qui permet au budget et au coût par 1 000 kcal
 * de fonctionner dès la première semaine, avant qu'il ait scanné le moindre ticket.
 */
export const referencePricesEurPerKg: Record<string, number> = {
  // protéines
  "chicken-breast": 11.5, "chicken-thigh": 7.5, "chicken-drumstick": 5.5, "turkey-escalope": 12.5,
  "beef-steak": 19.9, "beef-mince-5": 14.9, "beef-mince-15": 10.9, "beef-braising": 13.5,
  "lamb-shoulder": 16.9, "lamb-chops": 22.9, merguez: 11.9, "pork-loin": 12.9,
  lardons: 9.9, ham: 13.9, chorizo: 17.9, "duck-breast": 24.9,
  salmon: 22.9, "salmon-smoked": 39.9, "tuna-canned": 12.5, cod: 19.9, "white-fish": 13.9,
  "sardines-canned": 11.9, "mackerel-canned": 9.9, shrimp: 17.9, mussels: 4.5, squid: 12.9,
  egg: 5.4, "tofu-firm": 9.9, "tofu-smoked": 12.9,
  "lentils-green": 3.2, "lentils-red": 3.6, "chickpeas-dry": 2.6, "chickpeas-canned": 2.4,
  "white-beans": 2.6, "red-beans": 2.6, "black-beans": 3.4, "whey-protein": 24.9,

  // féculents
  "rice-basmati": 3.2, "rice-white": 1.9, "rice-brown": 2.9, pasta: 1.9, "pasta-wholegrain": 2.9,
  "noodles-wheat": 4.9, "rice-noodles": 4.5, potato: 1.6, "sweet-potato": 3.2,
  couscous: 2.2, bulgur: 2.9, quinoa: 6.9, polenta: 2.4, oats: 2.2,
  "bread-baguette": 4.0, "bread-wholegrain": 4.4, "bread-sandwich": 3.4,
  "tortilla-wheat": 6.9, "tortilla-corn": 7.4, pita: 5.4, "semolina-fine": 1.9,
  "flour-wheat": 1.2, cornstarch: 3.4, breadcrumbs: 3.2, granola: 7.9,

  // légumes
  onion: 1.7, "red-onion": 2.5, shallot: 4.5, garlic: 9.9, tomato: 3.2, "cherry-tomato": 6.9,
  "tomato-canned": 2.2, courgette: 2.6, aubergine: 3.4, "bell-pepper": 3.9, carrot: 1.5,
  broccoli: 3.4, cauliflower: 2.6, spinach: 6.9, "green-beans": 4.9, peas: 2.4,
  mushroom: 5.4, leek: 2.6, cucumber: 2.2, lettuce: 3.4, cabbage: 1.6, "red-cabbage": 2.2,
  celery: 2.6, fennel: 3.4, butternut: 2.4, sweetcorn: 3.4, beetroot: 3.4, asparagus: 12.9,
  "olives-black": 8.9, "olives-green": 8.9, "ginger-fresh": 8.9,
  parsley: 16.0, "coriander-fresh": 18.0, mint: 20.0, basil: 24.0,

  // fruits
  banana: 1.9, apple: 2.6, orange: 2.4, clementine: 3.2, strawberry: 8.9, raspberry: 19.9,
  blueberry: 17.9, mango: 4.9, pineapple: 2.4, watermelon: 1.4, melon: 2.9, grapes: 4.9,
  kiwi: 3.9, pear: 2.9, peach: 3.9, pomegranate: 4.9, fig: 8.9,
  dates: 8.9, "dried-apricot": 9.9, raisins: 5.9, avocado: 7.9, lemon: 3.2, lime: 6.9,

  // laitages
  "greek-yogurt": 4.4, skyr: 6.4, "yogurt-plain": 2.4, "fromage-blanc": 3.2,
  "cottage-cheese": 6.9, "milk-semi": 1.1, "milk-whole": 1.2, "cream-liquid": 4.4,
  "creme-fraiche": 4.9, butter: 11.9, mozzarella: 8.9, feta: 12.9, parmesan: 24.9,
  comte: 19.9, cheddar: 12.9, "goat-cheese": 16.9, ricotta: 6.9,

  // matières grasses et fruits secs
  "olive-oil": 9.9, "rapeseed-oil": 3.4, "sunflower-oil": 2.6, "sesame-oil": 14.9,
  "peanut-butter": 8.9, tahini: 12.9, almonds: 17.9, walnuts: 16.9, cashews: 18.9,
  peanuts: 7.9, hazelnuts: 19.9, pistachios: 29.9, "pine-nuts": 59.9,
  "sesame-seeds": 9.9, "pumpkin-seeds": 12.9, chia: 11.9,

  // sauces et condiments
  "tomato-paste": 4.4, passata: 2.4, "coconut-milk": 4.4, "soy-sauce": 6.9, "fish-sauce": 7.9,
  harissa: 9.9, sriracha: 8.9, gochujang: 8.9, miso: 12.9, mustard: 4.9, mayonnaise: 5.9,
  ketchup: 3.4, honey: 12.9, "maple-syrup": 19.9, balsamic: 7.9, "vinegar-cider": 2.4,
  "stock-cube": 12.0, "curry-paste": 14.9, pesto: 12.9,

  // épices
  salt: 0.8, "black-pepper": 39.0, cumin: 24.0, paprika: 22.0, "smoked-paprika": 28.0,
  "ras-el-hanout": 32.0, "curry-powder": 22.0, "garam-masala": 30.0, turmeric: 20.0,
  cinnamon: 26.0, "ginger-ground": 24.0, "chili-flakes": 26.0, "coriander-seed": 22.0,
  oregano: 40.0, thyme: 40.0, "bay-leaf": 45.0, nutmeg: 60.0, "herbes-provence": 30.0,

  // placard
  sugar: 1.1, "dark-chocolate": 14.9, "cocoa-powder": 12.9,
};
