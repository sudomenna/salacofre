/* Atlas Menna — mock election data + rule-of-three projection engine.
   All figures are SIMULATED for the prototype (static snapshot). Candidate lists follow TSE registrations closed 15 Aug 2026. */
(function () {
  const hash = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 100000) / 100000; };
  const rnd = (seed, k) => hash(seed + ':' + k);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // codigo, sigla, nome, eleitores (milhões), margem PT−PL base (pp), apurado (%)
  const UF = [
    [12,'AC','Acre',0.6,-38,88],[27,'AL','Alagoas',2.3,24,71],[13,'AM','Amazonas',2.7,6,54],[16,'AP','Amapá',0.6,9,93],
    [29,'BA','Bahia',11.3,44,58],[23,'CE','Ceará',6.9,49,66],[53,'DF','Distrito Federal',2.2,-14,97],[32,'ES','Espírito Santo',2.9,-19,74],
    [52,'GO','Goiás',5.1,-16,69],[21,'MA','Maranhão',5.0,48,49],[31,'MG','Minas Gerais',16.3,4,63],[50,'MS','Mato Grosso do Sul',2.0,-24,81],
    [51,'MT','Mato Grosso',2.5,-33,77],[15,'PA','Pará',6.2,14,44],[25,'PB','Paraíba',3.1,33,72],[26,'PE','Pernambuco',6.9,39,61],
    [22,'PI','Piauí',2.5,54,79],[41,'PR','Paraná',8.5,-24,70],[33,'RJ','Rio de Janeiro',12.8,-9,57],[24,'RN','Rio Grande do Norte',2.5,34,83],
    [11,'RO','Rondônia',1.2,-43,90],[14,'RR','Roraima',0.4,-47,95],[43,'RS','Rio Grande do Sul',8.6,-8,66],[42,'SC','Santa Catarina',5.6,-44,73],
    [28,'SE','Sergipe',1.7,33,86],[35,'SP','São Paulo',34.1,-7,60],[17,'TO','Tocantins',1.1,3,84],
  ].map(r => ({ codigo: r[0], sigla: r[1], nome: r[2], eleitores: r[3] * 1e6, margem: r[4], apurado: r[5] }));
  const UF_BY_CODE = Object.fromEntries(UF.map(u => [u.codigo, u]));
  const UF_BY_SIGLA = Object.fromEntries(UF.map(u => [u.sigla, u]));
  const CAPITAIS = new Set([3550308,3304557,3106200,2927408,2304400,1302603,4106902,2611606,5208707,1501402,4314902,2111300,2704302,5300108,5002704,5103403,2408102,2507507,2211001,2800308,4205407,3205309,1100205,1200401,1600303,1400100,1721000]);

  const PARTIES = { PT:'Partido dos Trabalhadores', PL:'Partido Liberal', PSD:'Partido Social Democrático', NOVO:'Partido Novo', AVANTE:'Avante', 'MISSÃO':'Missão', PRTB:'PRTB', UP:'Unidade Popular', PCO:'PCO', DC:'Democracia Cristã', PSTU:'PSTU', PCB:'PCB', DEMOCRATA:'Democrata', REPUBLICANOS:'Republicanos', PSB:'PSB', REDE:'Rede', PP:'Progressistas', PODE:'Podemos', CIDADANIA:'Cidadania', AGIR:'Agir', PSOL:'PSOL', MDB:'MDB', 'UNIÃO':'União Brasil', PRD:'PRD' };

  // ---- Candidates (share = national baseline %, boost = per-UF adjustments) ----
  const PRES = [
    { id:'lula', nome:'Lula', completo:'Luiz Inácio Lula da Silva', partido:'PT', vice:'Geraldo Alckmin (PSB)', pole:'A' },
    { id:'flavio', nome:'Flávio Bolsonaro', completo:'Flávio Nantes Bolsonaro', partido:'PL', vice:'Alfredo Gaspar (PL)', pole:'B' },
    { id:'cury', nome:'Augusto Cury', partido:'AVANTE', vice:'Júlio Delgado (Avante)', share:5.2, boost:{ SP:1.5, MG:1 } },
    { id:'caiado', nome:'Ronaldo Caiado', partido:'PSD', vice:'Gilberto Kassab (PSD)', share:3.6, boost:{ GO:22, DF:4, MT:3, TO:3 } },
    { id:'zema', nome:'Romeu Zema', partido:'NOVO', vice:'Eduardo Girão (Novo)', share:2.6, boost:{ MG:8, SP:1 } },
    { id:'renan', nome:'Renan Santos', partido:'MISSÃO', vice:'Coronel Medina (Missão)', share:1.4, boost:{ SP:1, SC:1, PR:1 } },
    { id:'marcal', nome:'Pablo Marçal', partido:'PRTB', vice:'Leonardo Avalanche (PRTB)', share:1.0, boost:{ SP:2, GO:1 }, status:'sub judice' },
    { id:'grassi', nome:'Wilson Grassi', partido:'DEMOCRATA', vice:'Suêd Haidar (Democrata)', share:0.5 },
    { id:'samara', nome:'Samara', partido:'UP', vice:'Raquel Brício (UP)', share:0.4 },
    { id:'pimenta', nome:'Rui Costa Pimenta', partido:'PCO', vice:'Antônio Carlos (PCO)', share:0.2 },
    { id:'clariana', nome:'Clariana Barão', partido:'DC', vice:'Fabiana Torquato (DC)', share:0.2 },
    { id:'hertz', nome:'Hertz Dias', partido:'PSTU', vice:'Vanessa Portugal (PSTU)', share:0.2 },
    { id:'edmilson', nome:'Edmilson Costa', partido:'PCB', vice:'Cleusa Santos (PCB)', share:0.1 },
  ];
  const GOV_SP = [
    { id:'tarcisio', nome:'Tarcísio de Freitas', partido:'REPUBLICANOS', vice:'Felício Ramuth (MDB)', pole:'A' },
    { id:'haddad', nome:'Fernando Haddad', partido:'PT', vice:'Márcio França (PSB)', pole:'B' },
    { id:'vera', nome:'Vera Lúcia', partido:'PSTU', share:0.9 },
    { id:'machado', nome:'Carlos Machado', partido:'PCB', share:0.4 },
    { id:'izadora', nome:'Izadora Dias', partido:'PCO', share:0.2 },
    { id:'edjane', nome:'Policial Edjane', partido:'AGIR', share:0.8 },
    { id:'vivian', nome:'Vivian Mendes', partido:'UP', share:0.5 },
  ];
  const SEN_SP = [
    { id:'salles', nome:'Salles', partido:'NOVO', pole:'A' },
    { id:'derrite', nome:'Guilherme Derrite', partido:'PP', pole:'B' },
    { id:'tebet', nome:'Simone Tebet', partido:'PSB', share:19.4 },
    { id:'marina', nome:'Marina Silva', partido:'REDE', share:13.8 },
    { id:'prado', nome:'André do Prado', partido:'PL', share:8.6 },
    { id:'rufino', nome:'Geraldo Rufino', partido:'PODE', share:3.9 },
    { id:'soninha', nome:'Soninha Francine', partido:'CIDADANIA', share:3.1 },
    { id:'marcio', nome:'Marcio Alves', partido:'UP', share:0.7 },
    { id:'maira', nome:'Maíra de Souza', partido:'UP', share:0.5 },
    { id:'guto', nome:'Guto Schiavetto', partido:'MISSÃO', share:1.6 },
    { id:'eliana', nome:'Dra Eliana Ferreira', partido:'PSTU', share:0.4 },
    { id:'maahs', nome:'Petter Maahs', partido:'PCB', share:0.3 },
    { id:'weller', nome:'Weller Gonçalves', partido:'PSTU', share:0.2 },
    { id:'cesaretti', nome:'Ednelson Cesaretti', partido:'PCO', share:0.1 },
    { id:'teixeira', nome:'William Teixeira', partido:'AGIR', share:0.4 },
  ];
  // Deputado federal SP — nomes de urna registrados; votos simulados
  const DEP_SP = [
    ['Erika Hilton','PSOL',1.02e6],['Lucas Pavanato','PL',0.94e6],['Celso Russomanno','REPUBLICANOS',0.61e6],['Sâmia Bomfim','PSOL',0.48e6],['Tabata Amaral','PSB',0.44e6],
    ['Cris Monteiro','NOVO',0.41e6],['Delegado Palumbo','PODE',0.39e6],['Datena','PSB',0.37e6],['Capitão Augusto','PL',0.35e6],['Guilherme Cortez','PSOL',0.33e6],
    ['Baleia Rossi','MDB',0.31e6],['Arlindo Chinaglia','PT',0.29e6],['Coronel Telhada','PP',0.28e6],['Carlos Zarattini','PT',0.27e6],['Adriana Ventura','NOVO',0.26e6],
    ['Alencar Santana','PT',0.24e6],['Eduardo Cury','PL',0.23e6],['Gil Diniz','PL',0.22e6],['Delegado Paulo Bilynskyj','PL',0.21e6],['Alex Manente','CIDADANIA',0.20e6],
    ['Fausto Pinato','UNIÃO',0.19e6],['Felipe Becari','PODE',0.18e6],['Bruno Ganem','PODE',0.17e6],['Duarte Nogueira','PSD',0.16e6],['Eleuses Paiva','PSD',0.15e6],
    ['Alexis Fonteyne','NOVO',0.14e6],['Edinho Silva','PT',0.13e6],['Geraldo Luís','AVANTE',0.12e6],['Frank Aguiar','PODE',0.11e6],['Guiga Peixoto','PRD',0.10e6],
  ].map((r, i) => ({ id: 'dep' + i, nome: r[0], partido: r[1], votos: Math.round(r[2] * 0.60) }));
  const SEATS_SP = [['PL',16],['PT · FE Brasil',12],['PSD',8],['União Progressista',7],['REPUBLICANOS',6],['PSOL · Rede',5],['PSB',4],['NOVO',4],['MDB',4],['PODE',3],['PSDB · Cidadania',1]];

  // Race definitions: two poles + tail. margin(ufSigla) returns pole A − pole B in pp.
  const RACES = {
    presidente: { label: 'Presidente', scope: 'BR', candidates: PRES, marginUF: uf => uf.margem + 2, colors: ['pt', 'pl'], turno2: { margin: uf => uf.margem + 2.5, apuradoScale: 1.28 } },
    governador: { label: 'Governador', scope: 'UF', candidates: GOV_SP, marginUF: () => 16, colors: ['republicanos', 'pt'], turno2: null, turno2note: 'Decidido no 1º turno se um candidato passar de 50% dos válidos.' },
    senador: { label: 'Senador', scope: 'UF', candidates: SEN_SP, marginUF: () => 3.2, colors: ['novo', 'pp'], turno2: null, turno2note: 'Eleição de senador é em turno único.' },
    deputado: { label: 'Dep. Federal', scope: 'UF', candidates: DEP_SP, seats: SEATS_SP, turno2: null, turno2note: 'Eleição proporcional, turno único. 70 vagas em SP.' },
  };

  // ---- Generators ----
  function baseShares(race, uf, turno) {
    // returns {id: pct} for the tail (non-pole) candidates in this UF
    if (turno === 2) return {};
    const out = {};
    race.candidates.forEach(c => { if (!c.pole) out[c.id] = clamp((c.share || 0) + ((c.boost && c.boost[uf.sigla]) || 0) + (rnd(uf.sigla + c.id, 'b') - 0.5) * (c.share > 3 ? 2.4 : 0.3), 0.05, 60); });
    return out;
  }
  function munProfile(munId, uf, race, turno, c) {
    const cap = CAPITAIS.has(munId);
    const s1 = hash(uf.sigla + race.label) * 6.28, s2 = hash(race.label + uf.sigla) * 6.28;
    const field = c ? 22 * Math.sin(c[0] * 0.95 + s1) * Math.cos(c[1] * 1.15 + s2) + 8 * Math.sin((c[0] + c[1]) * 2.1 + s1) : (rnd(munId, 'm') - 0.5) * 30;
    const w = cap ? 0.28 + rnd(munId, 'w') * 0.1 : Math.exp((rnd(munId, 'w') - 0.5) * 3.2) * 0.35 / 100; // electorate weight
    const apurado = clamp(Math.round(uf.apurado * (turno === 2 && race.turno2 ? race.turno2.apuradoScale : 1) + (rnd(munId, 'a') - 0.5) * 70), 0, 100);
    const mBase = race.marginUF(uf) + (turno === 2 && race.turno2 ? 2.5 : 0);
    const margin = clamp(mBase + field + (rnd(munId, 'm') - 0.5) * 9 + (cap ? -4 : 0), -80, 80);
    const tail = baseShares(race, uf, turno);
    const tailScale = 0.75 + rnd(munId, 't') * 0.5;
    let others = 0; const shares = {};
    Object.keys(tail).forEach(id => { shares[id] = tail[id] * tailScale; others += shares[id]; });
    if (others > 60) { Object.keys(shares).forEach(id => shares[id] *= 60 / others); others = 60; }
    const rest = 100 - others;
    const [A, B] = race.candidates.filter(c => c.pole).sort((a, b) => a.pole < b.pole ? -1 : 1);
    shares[A.id] = (rest + margin) / 2; shares[B.id] = (rest - margin) / 2;
    if (shares[B.id] < 0.2) { shares[A.id] += shares[B.id] - 0.2; shares[B.id] = 0.2; }
    return { w, apurado, shares, cap };
  }
  const cache = {};
  function ufResult(uf, race, turno, munIds) {
    const key = race.label + turno + uf.sigla + (munIds ? munIds.length : 0);
    if (cache[key]) return cache[key];
    const ids = munIds && munIds.length ? munIds : Array.from({ length: 60 }, (_, i) => ({ id: uf.codigo * 100000 + i }));
    const eleitores = uf.eleitores; const turnout = 0.795, valid = turno === 2 ? 0.955 : 0.935;
    let wsum = 0; const muns = ids.map(o => { const id = typeof o === 'object' ? o.id : o; const p = munProfile(id, uf, race, turno, typeof o === 'object' ? o.c : null); wsum += p.w; return { id, ...p }; });
    const partial = {}, proj = {}; let counted = 0, total = 0;
    const muniOut = muns.map(m => {
      const el = eleitores * (m.w / wsum); const validVotes = el * turnout * valid; const countedVotes = validVotes * m.apurado / 100;
      total += validVotes; counted += countedVotes;
      const votes = {}, pv = {};
      Object.keys(m.shares).forEach(id => { votes[id] = countedVotes * m.shares[id] / 100; pv[id] = validVotes * m.shares[id] / 100; partial[id] = (partial[id] || 0) + votes[id]; proj[id] = (proj[id] || 0) + pv[id]; });
      return { id: m.id, eleitores: el, apurado: m.apurado, votes, projVotes: pv, shares: m.shares, capital: m.cap };
    });
    const res = { uf, apurado: counted / total * 100, counted, total, partial, proj, muns: muniOut, eleitores };
    cache[key] = res; return res;
  }
  function toRows(race, votesMap, projMap) {
    const sum = Object.values(votesMap).reduce((a, b) => a + b, 0) || 1; const psum = Object.values(projMap).reduce((a, b) => a + b, 0) || 1;
    return race.candidates.filter(c => votesMap[c.id] != null).map(c => ({ ...c, votos: Math.round(votesMap[c.id]), pct: votesMap[c.id] / sum * 100, projPct: projMap[c.id] / psum * 100 })).sort((a, b) => b.pct - a.pct);
  }
  function nationalResult(turno, munIdsByUF) {
    const race = RACES.presidente; const partial = {}, proj = {}; let counted = 0, total = 0; const perUF = {};
    UF.forEach(uf => { const r = ufResult(uf, race, turno, munIdsByUF && munIdsByUF[uf.codigo]); perUF[uf.sigla] = r; counted += r.counted; total += r.total; Object.keys(r.partial).forEach(id => { partial[id] = (partial[id] || 0) + r.partial[id]; proj[id] = (proj[id] || 0) + r.proj[id]; }); });
    return { apurado: counted / total * 100, counted, total, rows: toRows(race, partial, proj), perUF };
  }
  // Normal CDF for probability estimates
  const Phi = x => 0.5 * (1 + erf(x / Math.SQRT2));
  function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
  function chances(rows, apurado) {
    const top = rows[0]; if (!top) return { win1: 0, second: 100, sigma: 0 };
    const sigma = 1.2 + 7 * (1 - apurado / 100);
    const win1 = (1 - Phi((50 - top.projPct) / sigma)) * 100;
    return { win1, second: 100 - win1, sigma };
  }
  function deputyResult() {
    const rows = DEP_SP.map((c, i) => ({ ...c, rank: i + 1, pct: 0 }));
    const sum = rows.reduce((a, r) => a + r.votos, 0);
    rows.forEach(r => { r.pct = r.votos / sum * 100 * 0.42; r.projVotos = Math.round(r.votos / 0.60 * (0.97 + rnd(r.id, 'p') * 0.06)); r.status = r.rank <= 18 ? 'eleito' : r.rank <= 26 ? 'na disputa' : 'fora'; });
    return { rows, apurado: 60.2, quociente: 306412, vagas: 70, seats: SEATS_SP };
  }
  window.AM_DATA = { UF, UF_BY_CODE, UF_BY_SIGLA, PARTIES, RACES, PRES, GOV_SP, SEN_SP, DEP_SP, SEATS_SP, CAPITAIS, ufResult, nationalResult, toRows, chances, deputyResult, rnd, hash };
})();
