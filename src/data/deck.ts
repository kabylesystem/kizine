/**
 * Cartes du tri de l'onboarding.
 *
 * 146 cartes, c'était trop (retour de default-user). Ne restent que celles dont la réponse
 * change vraiment le plan : les protéines, les bases, les légumes qu'on aime ou déteste
 * vraiment, et les goûts marqués. Les épices sèches, les doublons évidents et les fruits
 * de second rang sont déduits des duels de plats et des cuisines choisies.
 */
export const deckIds: string[] = [
  // protéines : le poste qui structure tout
  "chicken-breast", "chicken-thigh", "turkey-escalope", "beef-steak", "beef-mince-15",
  "beef-braising", "lamb-shoulder", "lamb-chops", "merguez", "pork-loin", "ham", "lardons",
  "chorizo", "duck-breast", "salmon", "salmon-smoked", "tuna-canned", "cod", "sardines-canned",
  "shrimp", "mussels", "egg", "tofu-firm", "lentils-green", "chickpeas-canned", "red-beans",

  // bases
  "rice-basmati", "rice-brown", "pasta", "noodles-wheat", "potato", "sweet-potato",
  "couscous", "bulgur", "quinoa", "oats", "bread-baguette", "bread-wholegrain",
  "tortilla-wheat", "pita", "granola",

  // légumes
  "onion", "garlic", "tomato", "courgette", "aubergine", "bell-pepper", "carrot",
  "broccoli", "cauliflower", "spinach", "green-beans", "peas", "mushroom", "leek",
  "cucumber", "lettuce", "butternut", "olives-black", "coriander-fresh", "mint",

  // fruits
  "banana", "apple", "orange", "strawberry", "blueberry", "mango", "grapes", "avocado", "dates",

  // laitages
  "greek-yogurt", "skyr", "fromage-blanc", "milk-semi", "cream-liquid", "butter",
  "mozzarella", "feta", "parmesan", "cheddar",

  // gras et fruits secs
  "olive-oil", "peanut-butter", "tahini", "almonds", "peanuts",

  // goûts marqués
  "harissa", "sriracha", "gochujang", "soy-sauce", "coconut-milk", "mustard", "pesto",
  "honey", "dark-chocolate",
];

const seen = new Set<string>();
for (const id of deckIds) {
  if (seen.has(id)) throw new Error(`carte en double : ${id}`);
  seen.add(id);
}
