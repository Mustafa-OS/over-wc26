// ============================================================================
// POPULAR PLAYERS
// ----------------------------------------------------------------------------
// Surfaces the headline / big-name players in a match so a new user can find
// faces they recognise instead of scanning a full squad list.
//
// There is no "fame" field in the squad feed, so we match player names against
// a curated list of globally well-known players. It is best-effort and easy to
// extend — add a surname (or, for ambiguous ones, a two-word key) below.
//
// Matching is accent- and punctuation-insensitive, and works on both the live
// full names ("Kylian Mbappé") and the short forms used in the mock/UI
// ("Mbappé", "E. Martínez"). Single-word keys match a whole name token;
// multi-word keys match as a substring (so "de paul" hits "Rodrigo De Paul").
// ============================================================================

// All keys are pre-normalised: lowercase, no accents, spaces between words.
const STAR_KEYS = [
  // — global icons / forwards & attacking mids —
  'messi', 'ronaldo', 'mbappe', 'haaland', 'neymar', 'bellingham', 'vinicius',
  'rodrygo', 'raphinha', 'kane', 'foden', 'saka', 'rice', 'rodri', 'pedri',
  'gavi', 'yamal', 'musiala', 'wirtz', 'kimmich', 'griezmann', 'dembele',
  'modric', 'kovacic', 'kramaric', 'perisic', 'gvardiol', 'kvaratskhelia',
  'osimhen', 'm salah', 'mohamed salah', 'lewandowski', 'zielinski', 'mahrez', 'lukaku', 'courtois',
  'doku', 'casemiro', 'marquinhos', 'militao', 'alisson', 'ederson', 'antony',
  'richarlison', 'endrick', 'neuer', 'rudiger', 'gundogan', 'sane', 'havertz',
  'fullkrug', 'maignan', 'kounde', 'saliba', 'tchouameni', 'camavinga',
  'thuram', 'carvajal', 'cucurella', 'morata', 'olmo', 'pulisic',
  'mckennie', 'balogun', 'hojlund', 'isak', 'gyokeres', 'vlahovic', 'chiesa',
  'barella', 'donnarumma', 'tonali', 'kulusevski', 'odegaard', 'martinelli',
  'nunez', 'alvarez', 'otamendi', 'tagliafico', 'valverde', 'araujo', 'almada',
  'kante', 'mount', 'sterling', 'grealish', 'maddison', 'palmer', 'watkins',
  'toney', 'trippier', 'walker', 'stones', 'pickford', 'livakovic', 'depay',
  'ziyech', 'hakimi', 'amrabat', 'ounahi', 'amoura', 'gouiri', 'bennacer',
  'lookman', 'iwobi', 'ndidi', 'kudus', 'partey', 'schick', 'hlozek', 'akanji',
  'xhaka', 'sommer', 'embolo', 'shaqiri', 'reyna', 'weah', 'gakpo', 'simons',
  'koopmeiners', 'dumfries', 'leao', 'cancelo', 'vitinha', 'jota',
  // — ambiguous surnames (need a fuller key) + short forms used in the UI —
  'de bruyne', 'kevin de bruyne', 'de paul', 'di maria', 'mac allister',
  'e martinez', 'l martinez', 'lautaro martinez', 'emiliano martinez',
  't hernandez', 'theo hernandez', 'lucas hernandez', 'n williams',
  'nico williams', 'inaki williams', 'd olmo', 'dani olmo', 'u simon',
  'unai simon', 'bruno fernandes', 'bruno guimaraes', 'bruno g', 'vinicius jr',
  'heung min son', 'son heung min', 'van dijk', 'ter stegen', 'de jong',
  'bernardo silva', 'b silva', 'ruben dias', 'joao felix', 'nuno mendes',
  'alphonso davies',
  // — wider WC 2026 field (added after seeing the real squads) —
  // Mexico / hosts
  'jimenez', 'gimenez', 'ochoa', 'montes', 'pineda', 'lozano',
  // Brazil
  'cunha', 'paqueta', 'gabriel jesus',
  // Morocco
  'bounou', 'el kaabi', 'brahim diaz', 'ezzalzouli', 'en nesyri', 'mazraoui', 'saibari', 'ounahi',
  // Netherlands
  'ake', 'malen', 'weghorst', 'gravenberch', 'reijnders', 'timber', 'frimpong',
  // Japan
  'kubo', 'kamada', 'doan', 'tomiyasu', 'mitoma', 'endo', 'ueda', 'maeda',
  'ito', 'tanaka', 'minamino',
  // USA
  'dest', 'pepi', 'aaronson', 't adams', 'richards', 'musah', 'a robinson',
  // Paraguay
  'almiron', 'enciso', 'sanabria',
  // South Korea
  'kim min jae', 'lee kang in', 'hwang hee chan', 'hwang in beom',
  // Czechia
  'soucek', 'coufal',
  // Germany
  'goretzka', 'undav', 'tah', 'woltemade',
  // France
  'upamecano', 'barcola', 'kolo muani', 'rabiot',
  // England
  'rashford', 'mainoo', 'guehi', 'alexander arnold', 'anthony gordon',
  // Spain
  'merino', 'oyarzabal', 'ferran torres', 'fabian ruiz', 'laporte', 'zubimendi',
  // Belgium
  'tielemans', 'trossard', 'openda', 'de ketelaere',
  // Portugal
  'goncalo ramos',
  // Uruguay
  'ugarte', 'bentancur', 'arrascaeta', 'pellistri',
  // Colombia
  'luis diaz', 'james rodriguez', 'sinisterra', 'cuadrado',
  // Nigeria
  'chukwueze', 'boniface', 'onana',
  // Senegal
  'sadio mane', 's mane', 'nicolas jackson', 'ismaila sarr', 'idrissa gueye',
  // Ghana
  'ayew', 'semenyo',
  // Ecuador
  'caicedo', 'hincapie', 'estupinan', 'enner valencia',
  // Switzerland
  'freuler', 'ndoye',
  // Türkiye
  'calhanoglu', 'arda guler', 'yildiz', 'kokcu', 'demiral',
  // Scotland
  'mctominay', 'mcginn', 'gilmour', 'andy robertson', 'tierney',
  // Canada
  'jonathan david', 'larin', 'buchanan',
  // Croatia / others
  'sucic', 'szczesny', 'marmoush', 'trezeguet', 'afif', 'almoez',
  'eriksen', 'hojbjerg', 'milinkovic', 'tadic', 'mitrovic',
];

/** lowercase, strip accents, collapse non-alphanumerics to single spaces. */
export function normalizeName(s) {
  return String(s || '')
    .normalize('NFKD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * True if a normalised name matches any key in `keys`. Single-word keys match a
 * whole name token; multi-word keys match as a substring.
 */
export function matchesAny(name, keys) {
  const n = normalizeName(name);
  if (!n) return false;
  const tokens = new Set(n.split(' '));
  for (const key of keys) {
    if (key.indexOf(' ') >= 0) { if (n.includes(key)) return true; }
    else if (tokens.has(key)) return true;
  }
  return false;
}

/** True if a player name matches our curated star list. */
export function isStar(name) {
  return matchesAny(name, STAR_KEYS);
}

/**
 * The set of player IDs to show under "Popular" for a match.
 * @param {Array} players  position-ordered players (each { id, name, teamCode })
 * @returns {Set<string>}  up to `max` headline players: known stars first, topped
 *                         up with the most attacking players so the tab is never
 *                         near-empty — and ALWAYS at least one from each team, so
 *                         a star-heavy side can't crowd the other team out.
 */
export function popularIdSet(players, { max = 7 } = {}) {
  const stars = players.filter((p) => isStar(p.name));
  // Ranked candidates: known stars first (input order is position-sorted, F→G),
  // then everyone else as fill.
  const ranked = [...stars, ...players.filter((p) => !stars.includes(p))];
  const teams = [...new Set(players.map((p) => p.teamCode))];

  const chosen = [];
  const take = (p) => { if (p && chosen.length < max && !chosen.includes(p)) chosen.push(p); };
  // Guarantee at least one player from EACH team (its best-ranked candidate)…
  for (const t of teams) take(ranked.find((p) => p.teamCode === t));
  // …then fill the remaining slots by rank (stars first).
  for (const p of ranked) take(p);

  return new Set(chosen.map((p) => p.id));
}
