export const SECTIONS = [
  { key: 'produce', label: 'Fruit & veg' },
  { key: 'dairy', label: 'Dairy & eggs' },
  { key: 'bakery', label: 'Bread & bakery' },
  { key: 'meat', label: 'Meat & fish' },
  { key: 'staples', label: 'Staples & spices' },
  { key: 'snacks', label: 'Snacks & drinks' },
  { key: 'home', label: 'Cleaning & home' },
  { key: 'care', label: 'Personal care' },
  { key: 'other', label: 'Everything else' },
];

export const sectionLabel = (key) =>
  (SECTIONS.find((s) => s.key === key) ?? SECTIONS.at(-1)).label;

const WORDS = {
  produce:
    'onion potato tomato ginger garlic coriander dhania cilantro mint pudina lemon lime banana apple mango orange grape papaya watermelon melon pineapple pomegranate guava coconut spinach palak methi carrot beans cabbage cauliflower brinjal eggplant aubergine okra bhindi cucumber capsicum pepper peas corn mushroom lettuce broccoli beetroot radish pumpkin gourd lauki drumstick avocado berry strawberry blueberry kiwi pear peach plum cherry fruit veg vegetable herb basil celery zucchini leek spring onion sweet potato yam',
  dairy:
    'milk curd dahi yogurt yoghurt paneer butter ghee cheese cream egg buttermilk chaas lassi khoa',
  bakery: 'bread pav bun loaf croissant bagel cake muffin rusk toast bakery roti tortilla pita naan',
  meat: 'chicken mutton lamb fish prawn shrimp beef pork bacon ham sausage salami mince keema crab squid turkey',
  staples:
    'rice atta flour maida besan rava sooji semolina poha dal lentil chana rajma moong toor urad masoor oats sugar jaggery gur salt oil pasta noodle spaghetti vermicelli cereal cornflakes muesli honey jam peanut butter ketchup sauce vinegar masala haldi turmeric jeera cumin mustard chilli powder garam pepper spice cardamom elaichi clove cinnamon hing tamarind soy mayonnaise tea coffee nuts almond cashew raisin walnut pickle papad',
  snacks:
    'biscuit cookie chips namkeen crisps chocolate candy maggi juice soda cola coke pepsi sprite water beer wine icecream ice cream popcorn cracker wafer snack bhujia mixture',
  home:
    'soap detergent surf vim dishwash dish harpic phenyl floor cleaner bleach tissue toilet paper napkin foil cling bag garbage bin broom mop sponge scrub battery bulb candle matchbox lighter agarbatti incense freshener mosquito repellent',
  care:
    'shampoo conditioner toothpaste toothbrush brush floss mouthwash deodorant razor shaving lotion moisturiser moisturizer sunscreen facewash face wash handwash sanitiser sanitizer pad tampon diaper nappy cotton comb hair oil lip balm medicine paracetamol plaster bandage',
};

const PHRASES = [
  ['green chilli', 'produce'],
  ['chilli powder', 'staples'],
  ['red chilli', 'staples'],
  ['hair oil', 'care'],
  ['coconut oil', 'staples'],
  ['ice cream', 'snacks'],
  ['face wash', 'care'],
  ['hand wash', 'care'],
  ['toilet paper', 'home'],
  ['peanut butter', 'staples'],
  ['curry leaves', 'produce'],
  ['spring onion', 'produce'],
  ['sweet potato', 'produce'],
  ['cat food', 'other'],
  ['dog food', 'other'],
];

const LOOKUP = new Map();
for (const [key, list] of Object.entries(WORDS)) {
  for (const w of list.split(' ')) if (!LOOKUP.has(w)) LOOKUP.set(w, key);
}

const singular = (w) =>
  w.endsWith('oes')
    ? w.slice(0, -2)
    : w.endsWith('ies')
      ? `${w.slice(0, -3)}y`
      : w.endsWith('es') && LOOKUP.has(w.slice(0, -2))
        ? w.slice(0, -2)
        : w.endsWith('s') && !w.endsWith('ss')
          ? w.slice(0, -1)
          : w;

export function guessSection(text) {
  const t = ` ${text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ')} `;
  for (const [p, key] of PHRASES) if (t.includes(` ${p}`)) return key;
  const words = t.trim().split(' ');
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    const key = LOOKUP.get(w) ?? LOOKUP.get(singular(w));
    if (key) return key;
  }
  return 'other';
}

const UNITS = {
  kg: 'kg',
  kgs: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  g: 'g',
  gm: 'g',
  gms: 'g',
  gram: 'g',
  grams: 'g',
  l: 'L',
  lt: 'L',
  ltr: 'L',
  ltrs: 'L',
  litre: 'L',
  litres: 'L',
  liter: 'L',
  liters: 'L',
  ml: 'ml',
  pc: 'pc',
  pcs: 'pc',
  piece: 'pc',
  pieces: 'pc',
  pack: 'pack',
  packs: 'pack',
  packet: 'pack',
  packets: 'pack',
  pkt: 'pack',
  pkts: 'pack',
  dozen: 'dozen',
  dz: 'dozen',
  bunch: 'bunch',
  bunches: 'bunch',
  bottle: 'bottle',
  bottles: 'bottle',
  box: 'box',
  boxes: 'box',
  can: 'can',
  cans: 'can',
  tin: 'tin',
  tins: 'tin',
  jar: 'jar',
  jars: 'jar',
  bag: 'bag',
  bags: 'bag',
  loaf: 'loaf',
  loaves: 'loaf',
};

const NUM = String.raw`(\d+(?:[.,]\d+)?|\d+\/\d+|½|¼|¾|a|an|one|two|three|four|five|six|seven|eight|nine|ten|half)`;
const WORD_NUM = {
  a: '1',
  an: '1',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  half: '½',
  '1/2': '½',
  '1/4': '¼',
  '3/4': '¾',
};
const UNIT = `(${Object.keys(UNITS)
  .sort((a, b) => b.length - a.length)
  .join('|')})`;

const LEAD_UNIT = new RegExp(`^${NUM}\\s*${UNIT}\\.?\\s+(?:of\\s+)?(.+)$`, 'i');
const TAIL_UNIT = new RegExp(`^(.+?)[,\\s]+${NUM}\\s*${UNIT}\\.?$`, 'i');
const LEAD_X = /^(?:x|×)\s*(\d+)\s+(.+)$/i;
const TAIL_X = /^(.+?)[,\s]+(?:x|×)\s*(\d+)$/i;
const LEAD_N = /^(\d+)\s*(?:x|×)?\s+(.+)$/i;
const TAIL_N = /^(.+?)\s+(\d+)$/;

const num = (n) => WORD_NUM[n.toLowerCase()] ?? n.replace(',', '.');

function amount(n, u) {
  const unit = UNITS[u.toLowerCase()];
  const value = num(n);
  if (unit === 'dozen') return value === '1' ? '1 dozen' : `${value} dozen`;
  if (['kg', 'g', 'L', 'ml'].includes(unit)) return `${value} ${unit}`;
  const plural =
    value !== '1' && !['½', '¼', '¾'].includes(value)
      ? unit === 'box'
        ? 'boxes'
        : unit === 'bunch'
          ? 'bunches'
          : unit === 'loaf'
            ? 'loaves'
            : unit === 'pc'
              ? 'pc'
              : `${unit}s`
      : unit;
  return `${value} ${plural}`;
}

const tidy = (s) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export function parseItem(raw) {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;
  let m = s.match(LEAD_UNIT);
  if (m) return { text: tidy(m[3]), qty: amount(m[1], m[2]) };
  m = s.match(TAIL_UNIT);
  if (m) return { text: tidy(m[1]), qty: amount(m[2], m[3]) };
  m = s.match(LEAD_X) ?? s.match(LEAD_N);
  if (m && Number(m[1]) > 0 && Number(m[1]) < 1000)
    return { text: tidy(m[2]), qty: `×${m[1]}` };
  m = s.match(TAIL_X) ?? s.match(TAIL_N);
  if (m && Number(m[2]) > 0 && Number(m[2]) < 1000)
    return { text: tidy(m[1]), qty: `×${m[2]}` };
  return { text: tidy(s), qty: '' };
}
