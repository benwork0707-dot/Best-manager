// ===== Game data: leagues, clubs, competitions, player generation =====
const LEAGUES = [
  { id: 'pl', name: { ar: 'الدوري الإنجليزي الممتاز', fr: 'Premier League', en: 'Premier League' }, country: 'EN', color: '#3d195b',
    clubs: [
      ['Arsenal', 'ARS', '#ef0107', 83, '359'], ['Chelsea', 'CHE', '#034694', 82, '363'],
      ['Liverpool', 'LIV', '#c8102e', 85, '364'], ['Manchester United', 'MUN', '#da291c', 81, '360'],
      ['Manchester City', 'MCI', '#6cabdd', 86, '382'], ['Newcastle United', 'NEW', '#241f20', 78, '361'],
      ['Tottenham Hotspur', 'TOT', '#132257', 78, '367'], ['Brighton & Hove Albion', 'BHA', '#0057b8', 75, '331'],
    ] },
  { id: 'liga', name: { ar: 'الدوري الإسباني', fr: 'La Liga', en: 'La Liga' }, country: 'ES', color: '#ee8707',
    clubs: [
      ['Real Madrid', 'RMA', '#ffffff', 88, '86'], ['Atlético de Madrid', 'ATM', '#ce3524', 84, '1068'],
      ['FC Barcelona', 'BAR', '#a50044', 87, '83'], ['Sevilla FC', 'SEV', '#d4021d', 76, '243'],
      ['Valencia CF', 'VAL', '#ee7b00', 73, '94'], ['Athletic Club', 'ATH', '#d50032', 77, '93'],
      ['Real Sociedad', 'RSO', '#0067b1', 77, '89'], ['Villarreal CF', 'VIL', '#fcd116', 78, '102'],
    ] },
  { id: 'bun', name: { ar: 'الدوري الألماني', fr: 'Bundesliga', en: 'Bundesliga' }, country: 'DE', color: '#d20515',
    clubs: [
      ['Bayern München', 'BAY', '#dc052d', 87, '132'], ['Borussia Dortmund', 'BVB', '#fde100', 82, '124'],
      ['Bayer 04 Leverkusen', 'B04', '#e32221', 84, '131'], ['RB Leipzig', 'RBL', '#dd0741', 80, '11420'],
      ['Eintracht Frankfurt', 'SGE', '#e1000f', 77, '125'], ['VfL Wolfsburg', 'WOB', '#65b32e', 73, '138'],
      ['VfB Stuttgart', 'VFB', '#e32219', 78, '134'], ['SC Freiburg', 'SCF', '#000000', 72, '126'],
    ] },
  { id: 'sa', name: { ar: 'الدوري الإيطالي', fr: 'Serie A', en: 'Serie A' }, country: 'IT', color: '#0a2d6b',
    clubs: [
      ['AC Milan', 'MIL', '#fb090b', 82, '103'], ['Inter Milan', 'INT', '#010e80', 86, '110'],
      ['Juventus', 'JUV', '#000000', 82, '111'], ['Napoli', 'NAP', '#12a0d7', 80, '114'],
      ['AS Roma', 'ROM', '#a51f2d', 78, '104'], ['SS Lazio', 'LAZ', '#87d8f7', 76, '112'],
      ['Atalanta', 'ATA', '#1e71b8', 80, '105'], ['ACF Fiorentina', 'FIO', '#4b2e83', 74, '109'],
    ] },
];

// Continental & domestic cups (generated pools reuse league clubs)
const COMPETITIONS = {
  champions: { id: 'champions', name: { ar: 'دوري أبطال القارة', fr: 'Ligue des Champions', en: 'Champions Cup' }, type: 'continental' },
  supercup: { id: 'supercup', name: { ar: 'كأس السوبر القارية', fr: 'Supercoupe', en: 'Super Cup' }, type: 'continental' },
  nationalCup: { id: 'nationalCup', name: { ar: 'كأس البلاد', fr: 'Coupe nationale', en: 'National Cup' }, type: 'domestic' },
  worldCup: { id: 'worldCup', name: { ar: 'كأس العالم للمنتخبات', fr: 'Coupe du Monde', en: 'World Cup' }, type: 'international' },
};

// National teams (for international competitions)
const NATIONS = [
  ['Saudi Arabia', 'KSA', '#006c35', 75], ['Brazil', 'BRA', '#ffdf00', 88], ['Argentina', 'ARG', '#75aadb', 88],
  ['France', 'FRA', '#002395', 87], ['England', 'ENG', '#ffffff', 85], ['Spain', 'ESP', '#aa151b', 86],
  ['Germany', 'GER', '#000000', 84], ['Italy', 'ITA', '#0066b2', 82], ['Morocco', 'MAR', '#c1272d', 80],
  ['Japan', 'JPN', '#000080', 76], ['Egypt', 'EGY', '#ce1126', 74], ['Mauritania', 'MTN', '#00a95c', 60],
];

const FIRST_NAMES = ['Adam', 'Omar', 'Youssef', 'Karim', 'Lucas', 'Mateo', 'Hugo', 'Kenji', 'Ahmed', 'Ibrahim', 'Samir', 'Diego', 'Erik', 'Noah', 'Ali', 'Mehdi', 'Rafael', 'Tomas', 'Yassin', 'Luca'];
const LAST_NAMES = ['Haddad', 'Silva', 'Martin', 'Nasser', 'Rossi', 'Müller', 'Benali', 'Costa', 'Kovač', 'Mansour', 'Dupont', 'Garcia', 'Tanaka', 'Idrissi', 'Ferrer', 'Ali', 'Novak', 'Lindqvist', 'Okafor', 'Haidar'];
const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];
const POS_GROUP = { GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', CDM: 'MID', CM: 'MID', CAM: 'MID', LW: 'ATT', RW: 'ATT', ST: 'ATT' };

// Squad template: 2 GK, 6 DEF, 6 MID, 4 ATT = 18 players
const SQUAD_TEMPLATE = ['GK','GK','CB','CB','CB','LB','RB','LB','RB','CDM','CM','CM','CAM','CAM','LW','RW','ST','ST'];

// Deterministic-ish seeded RNG
let _seed = Date.now() % 2147483647;
function rnd() { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; }
function rndInt(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }

function makePlayer(pos, clubRating, idx) {
  const base = clubRating - 6 + rndInt(-6, 8);
  const ovr = Math.max(45, Math.min(93, base));
  const age = rndInt(18, 34);
  const val = Math.round(Math.pow(ovr / 60, 4) * 5_000_000 * (age < 24 ? 1.4 : age > 30 ? 0.7 : 1));
  return {
    id: 'p' + Date.now().toString(36) + idx + rndInt(1000, 9999),
    // Stable portrait URLs provide face portraits in the squad and tactical lineup.
    faceUrl: 'https://randomuser.me/api/portraits/men/' + ((idx * 7 + clubRating * 3 + rndInt(0, 80)) % 99) + '.jpg',
    name: pick(FIRST_NAMES) + ' ' + pick(LAST_NAMES),
    pos, ovr, age,
    potential: Math.min(95, ovr + Math.max(0, 26 - age) + rndInt(0, 4)),
    value: val,
    wage: Math.round(val / 250) || 1000,
    fitness: 100, morale: 70, form: 60, injuredWeeks: 0,
    stats: { apps: 0, goals: 0, assists: 0 },
    attrs: { attack: rndInt(40, 90), defense: rndInt(40, 90), physical: rndInt(40, 90), technical: rndInt(40, 90) },
  };
}

function makeSquad(clubRating) {
  return SQUAD_TEMPLATE.map((pos, i) => makePlayer(pos, clubRating, i));
}

// Build the league clubs with squads
function buildClubs() {
  const clubs = [];
  let n = 0;
  for (const lg of LEAGUES) {
    for (const [name, short, color, rating, logoId] of lg.clubs) {
      clubs.push({
        id: 'c' + (n++), name, short, color, rating, logoUrl: 'https://a.espncdn.com/i/teamlogos/soccer/500/' + logoId + '.png', league: lg.id,
        budget: 60_000_000 + rating * 500_000,
        reputation: rating,
        facilities: { stadium: 1 + Math.floor(rating / 25), training: 1 + Math.floor(rating / 25), youth: 1 + Math.floor(rating / 30) },
        squad: makeSquad(rating),
        formation: '4-3-3',
        lineup: null,
        fanMood: 60,
      });
    }
  }
  return clubs;
}
