/* Atlas Menna — screens. Uses design-system components from window.AtlasMenna (loaded by ds-loader.js). */
const D = window.AtlasMenna;
const AM = window.AM_DATA;
const { useState: uS, useEffect: uE, useMemo: uM, useRef: uR } = React;

const fmtPct = n => n == null || isNaN(n) ? '—' : n.toFixed(1).replace('.', ',') + '%';
const fmtPp = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1).replace('.', ',') + ' pp';
const fmtNum = n => Math.round(n).toLocaleString('pt-BR');
const fmtShort = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' mi' : n >= 1e3 ? Math.round(n / 1e3) + ' mil' : fmtNum(n);
const pc = s => D.partyColor(s);
const K = { font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-caps)', textTransform: 'uppercase', color: 'var(--text-secondary)' };
const SNAP = '21:47';

function useMedia(q) { const [m, set] = uS(() => window.matchMedia(q).matches); uE(() => { const mm = window.matchMedia(q); const f = () => set(mm.matches); mm.addEventListener('change', f); return () => mm.removeEventListener('change', f); }, [q]); return m; }

const Chevron = ({ dir = 'left', size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: dir === 'right' ? 'rotate(180deg)' : dir === 'down' ? 'rotate(-90deg)' : dir === 'up' ? 'rotate(90deg)' : 'none' }}><path d="m15 18-6-6 6-6" /></svg>;
const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;

/* ---------- shared panels ---------- */
function ResultPanel({ kicker, title, rows, apurado, counted, total, showProj, poles, limit = 6, onPick, note }) {
  const [all, setAll] = uS(false);
  const shown = all ? rows : rows.slice(0, limit);
  const a = rows[0], b = rows[1];
  const majority = !!poles;
  const segs = !a || !b ? [] : majority
    ? [{ label: a.nome.split(' ')[0], party: a.partido, pct: a.pct }, { label: 'Outros', pct: Math.max(0, 100 - a.pct - b.pct), color: 'var(--party-outros)' }, { label: b.nome.split(' ')[0], party: b.partido, pct: b.pct }]
    : rows.slice(0, 5).map(r => ({ label: r.nome.split(' ')[0], party: r.partido, pct: r.pct })).concat([{ label: 'Outros', pct: Math.max(0, 100 - rows.slice(0, 5).reduce((s, r) => s + r.pct, 0)), color: 'var(--party-outros)' }]);
  return (
    <D.Panel kicker={kicker} title={title}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <D.Figure label="Apurado" value={apurado.toFixed(1).replace('.', ',')} unit="%" note={fmtShort(counted) + ' de ' + fmtShort(total) + ' votos válidos'} />
        {a && b ? <D.Figure label={'Margem ' + (a.nome.split(' ')[0])} value={fmtPp(a.pct - b.pct).replace(' pp', '')} unit="pp" tone={a.partido === 'PT' ? 'pt' : a.partido === 'PL' ? 'pl' : 'default'} note={showProj ? 'projeção ' + fmtPp(a.projPct - b.projPct) : 'sobre o 2º colocado'} size="lg" /> : null}
      </div>
      {segs.length ? <D.VoteBar segments={segs} marker={majority ? 50 : null} showLabels={majority} style={{ marginBottom: 8 }} /> : null}
      {segs.length && !majority ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginBottom: 8, font: 'var(--type-data)', color: 'var(--text-secondary)' }}>{segs.map(s => <span key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: s.color || pc(s.party) }} />{s.label} {fmtPct(s.pct)}</span>)}</div> : null}
      <div>
        {shown.map((r, i) => <D.CandidateRow key={r.id} rank={i + 1} name={r.nome} party={r.partido} pct={r.pct} votes={r.votos} projPct={r.projPct} delta={r.projPct - r.pct} showProj={showProj} compact={i >= 2 && r.pct < 3} status={r.status} onClick={onPick ? () => onPick(r) : undefined} />)}
      </div>
      {rows.length > limit ? <D.Button variant="ghost" size="sm" full onClick={() => setAll(!all)} style={{ marginTop: 8 }}>{all ? 'Mostrar menos' : 'Todos os ' + rows.length + ' candidatos'} <Chevron dir={all ? 'up' : 'down'} size={14} /></D.Button> : null}
      {note ? <p style={{ margin: '12px 0 0', font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{note}</p> : null}
    </D.Panel>
  );
}

function ChancesPanel({ rows, apurado, mode }) {
  const ch = AM.chances(rows, apurado); const top = rows[0]; if (!top) return null;
  const tone = top.partido === 'PT' ? 'pt' : top.partido === 'PL' ? 'pl' : 'accent';
  return (
    <D.Panel kicker="Modelo Atlas" title={mode === 'gov' ? 'Decide no 1º turno?' : 'Segundo turno?'}>
      <div style={{ display: 'grid', gap: 18 }}>
        <D.ProbabilityMeter label="Chance de ir ao 2º turno" pct={ch.second} note={'Nenhum candidato alcança 50% + 1 dos válidos na projeção'} />
        <D.ProbabilityMeter label={top.nome + ' vence no 1º turno'} pct={ch.win1} tone={tone} note={'Projeção ' + fmtPct(top.projPct) + ' · incerteza ±' + ch.sigma.toFixed(1).replace('.', ',') + ' pp com ' + Math.round(apurado) + '% apurado'} />
      </div>
    </D.Panel>
  );
}

function StrongholdsPanel({ race, perUF, turno }) {
  const cands = race.candidates.slice(0, 5).filter(c => turno === 1 || c.pole);
  const [sel, setSel] = uS(cands[0].id);
  uE(() => { if (!cands.find(c => c.id === sel)) setSel(cands[0].id); }, [turno]);
  const list = uM(() => {
    const out = [];
    Object.values(perUF).forEach(r => {
      const rows = AM.toRows(race, r.partial, r.proj); const i = rows.findIndex(x => x.id === sel); if (i < 0) return;
      const me = rows[i]; const diff = i === 0 ? me.pct - rows[1].pct : me.pct - rows[0].pct;
      out.push({ uf: r.uf, rank: i + 1, pct: me.pct, diff, apurado: r.apurado, vs: i === 0 ? rows[1] : rows[0] });
    });
    return out.sort((a, b) => a.rank - b.rank || b.pct - a.pct).slice(0, 10);
  }, [sel, perUF]);
  const c = cands.find(x => x.id === sel);
  return (
    <D.Panel kicker="Por unidade federativa" title="Onde cada candidato é mais forte">
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {cands.map(x => <button key={x.id} type="button" onClick={() => setSel(x.id)} style={{ height: 30, padding: '0 10px', borderRadius: 'var(--radius-pill)', border: '1px solid ' + (sel === x.id ? pc(x.partido) : 'var(--border-hairline)'), background: sel === x.id ? pc(x.partido) : 'transparent', color: sel === x.id ? '#fff' : 'var(--text-primary)', cursor: 'pointer', font: 'var(--type-label)', fontSize: 'var(--text-xs)' }}>{x.nome.split(' ')[0]}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto auto', gap: '0 10px', alignItems: 'center' }}>
        <span style={K}>UF</span><span style={K}>Posição</span><span style={{ ...K, textAlign: 'right' }}>Diferença</span><span style={{ ...K, textAlign: 'right' }}>Válidos</span>
        {list.map(l => (
          <React.Fragment key={l.uf.sigla}>
            <span style={{ font: 'var(--type-figure-sm)', padding: '9px 0', borderTop: '1px solid var(--border-hairline)' }}>{l.uf.sigla}</span>
            <span style={{ padding: '9px 0', borderTop: '1px solid var(--border-hairline)', font: 'var(--type-body-sm)', minWidth: 0 }}>
              <span style={{ display: 'inline-block', minWidth: 22, font: 'var(--type-kicker)', color: l.rank === 1 ? 'var(--status-final)' : 'var(--text-secondary)' }}>{l.rank}º</span>
              <span style={{ color: 'var(--text-secondary)' }}>{l.rank === 1 ? 'à frente de ' : 'atrás de '}{l.vs.nome.split(' ')[0]}</span>
            </span>
            <span style={{ padding: '9px 0', borderTop: '1px solid var(--border-hairline)', font: 'var(--type-figure-sm)', textAlign: 'right', color: l.diff >= 0 ? 'var(--status-final)' : 'var(--status-warn)' }}>{fmtPp(l.diff)}</span>
            <span style={{ padding: '9px 0', borderTop: '1px solid var(--border-hairline)', font: 'var(--type-figure-sm)', textAlign: 'right' }}>{fmtPct(l.pct)}</span>
          </React.Fragment>
        ))}
      </div>
      <p style={{ margin: '10px 0 0', font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>10 UFs onde {c.nome} tem maior % de válidos, agrupadas por posição. Em 1º: distância para o 2º; em 2º ou abaixo: distância para o 1º.</p>
    </D.Panel>
  );
}

function RemainingPanel({ items, unitLabel }) {
  const max = Math.max(...items.map(i => i.remaining), 1);
  return (
    <D.Panel kicker="Onde a apuração está atrasada" title="Votos que ainda faltam">
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map(i => (
          <div key={i.key} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 12px', alignItems: 'baseline' }}>
            <span style={{ font: 'var(--type-body-sm)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {Math.round(i.apurado)}% apurado</span></span>
            <span style={{ font: 'var(--type-figure-sm)' }}>{fmtShort(i.remaining)}</span>
            <div style={{ gridColumn: '1 / -1', height: 6, background: 'var(--surface-sunken)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: i.remaining / max * 100 + '%', height: '100%', background: pc(i.leader.partido) }} /></div>
            <span style={{ gridColumn: '1 / -1', font: 'var(--type-data)', color: 'var(--text-secondary)' }}>{i.leader.nome} lidera a projeção local com {fmtPct(i.leader.projPct)}</span>
          </div>
        ))}
      </div>
      <p style={{ margin: '10px 0 0', font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Estimativa de válidos ainda não apurados por {unitLabel}. A barra usa a cor de quem lidera a projeção ali.</p>
    </D.Panel>
  );
}

function BulletinPanel({ items }) {
  return (
    <D.Panel kicker="Boletim" title="Últimas atualizações">
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid' }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--border-hairline)' : 0 }}>
            <span style={{ font: 'var(--type-data)', color: 'var(--text-muted)' }}>{it.time}</span>
            <span style={{ font: 'var(--type-body-sm)', textWrap: 'pretty' }}><strong style={{ fontWeight: 600 }}>{it.head}</strong> {it.text}</span>
          </li>
        ))}
      </ol>
    </D.Panel>
  );
}

function BiggestPanel({ result, race, nomes, onPick, showProj }) {
  const muns = uM(() => result.muns.slice().sort((a, b) => (b.capital ? 1e12 : 0) + b.eleitores - ((a.capital ? 1e12 : 0) + a.eleitores)).slice(0, 8), [result]);
  return (
    <D.Panel kicker="Municípios" title="Maiores colégios eleitorais">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0 10px' }}>
        <span style={K}>Município</span><span style={{ ...K, textAlign: 'right' }}>Líder</span><span style={{ ...K, textAlign: 'right' }}>{showProj ? 'Proj.' : 'Parcial'}</span>
        {muns.map(m => { const rows = AM.toRows(race, m.votes, m.projVotes); const l = rows[0]; return (
          <React.Fragment key={m.id}>
            <button type="button" onClick={() => onPick(m.id)} style={{ textAlign: 'left', border: 0, borderTop: '1px solid var(--border-hairline)', background: 'transparent', padding: '10px 0', cursor: 'pointer', color: 'var(--text-primary)', font: 'var(--type-body-sm)', fontWeight: 500, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomes[m.id] || m.id}{m.capital ? <span style={{ ...K, marginLeft: 6 }}>capital</span> : null}</span>
              <span style={{ font: 'var(--type-data)', color: 'var(--text-muted)' }}>{fmtShort(m.eleitores)} eleitores · {m.apurado}% apurado</span>
            </button>
            <span style={{ borderTop: '1px solid var(--border-hairline)', padding: '10px 0', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}><D.PartyTag sigla={l.partido} size="sm" /></span>
            <span style={{ borderTop: '1px solid var(--border-hairline)', padding: '10px 0', font: 'var(--type-figure-sm)', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: showProj ? 'var(--accent-strong)' : 'inherit' }}>{fmtPct(showProj ? l.projPct : l.pct)}</span>
          </React.Fragment>
        ); })}
      </div>
    </D.Panel>
  );
}

function SeatsPanel({ seats, quociente, vagas }) {
  const total = seats.reduce((a, s) => a + s[1], 0);
  return (
    <D.Panel kicker="Proporcional · 70 vagas" title="Projeção de cadeiras por partido">
      <div style={{ display: 'flex', height: 22, borderRadius: 'var(--radius-xs)', overflow: 'hidden', marginBottom: 10 }}>
        {seats.map(s => <div key={s[0]} title={s[0] + ' ' + s[1]} style={{ width: s[1] / total * 100 + '%', background: pc(s[0].split(' ')[0]), borderRight: '1px solid var(--surface-card)' }} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
        {seats.map(s => <div key={s[0]} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, font: 'var(--type-body-sm)' }}><span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: pc(s[0].split(' ')[0]), flex: 'none' }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s[0]}</span></span><span style={{ font: 'var(--type-figure-sm)' }}>{s[1]}</span></div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
        <D.Figure label="Quociente eleitoral" value={fmtNum(quociente)} size="md" note="válidos ÷ vagas (projetado)" />
        <D.Figure label="Vagas em disputa" value={vagas} size="md" note="Câmara dos Deputados · SP" />
      </div>
    </D.Panel>
  );
}

function DeputiesPanel({ dep, query, setQuery, onPick }) {
  const q = query.trim().toLowerCase();
  const rows = dep.rows.filter(r => !q || r.nome.toLowerCase().includes(q) || r.partido.toLowerCase().includes(q)).slice(0, q ? 50 : 20);
  return (
    <D.Panel kicker={'Deputado federal · SP · ' + dep.apurado.toFixed(1).replace('.', ',') + '% apurado'} title="Mais votados">
      <D.SearchInput value={query} onChange={setQuery} placeholder="Buscar por nome ou partido" style={{ marginBottom: 8 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: '0 10px' }}>
        {rows.map(r => (
          <React.Fragment key={r.id}>
            <span style={{ font: 'var(--type-data)', color: 'var(--text-muted)', padding: '10px 0', borderTop: '1px solid var(--border-hairline)' }}>{r.rank}</span>
            <button type="button" onClick={() => onPick(r)} style={{ textAlign: 'left', border: 0, background: 'transparent', padding: '10px 0', borderTop: '1px solid var(--border-hairline)', cursor: 'pointer', color: 'var(--text-primary)', minWidth: 0, display: 'grid', gap: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}><span style={{ font: 'var(--type-body-sm)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nome}</span><D.PartyTag sigla={r.partido} size="sm" /></span>
              <span style={{ font: 'var(--type-data)', color: r.status === 'eleito' ? 'var(--status-final)' : r.status === 'na disputa' ? 'var(--accent-strong)' : 'var(--text-muted)' }}>{r.status === 'eleito' ? '✓ eleito (projeção)' : r.status === 'na disputa' ? '● na disputa pela vaga' : '○ fora das vagas'}</span>
            </button>
            <span style={{ textAlign: 'right', padding: '10px 0', borderTop: '1px solid var(--border-hairline)', display: 'grid', gap: 3 }}>
              <span style={{ font: 'var(--type-figure-sm)' }}>{fmtShort(r.votos)}</span>
              <span style={{ font: 'var(--type-data)', color: 'var(--accent-strong)' }}>proj. {fmtShort(r.projVotos)}</span>
            </span>
          </React.Fragment>
        ))}
        {!rows.length ? <p style={{ gridColumn: '1 / -1', font: 'var(--type-body-sm)', color: 'var(--text-muted)', margin: '12px 0' }}>Nenhum candidato encontrado para “{query}”.</p> : null}
      </div>
      {!q ? <p style={{ margin: '10px 0 0', font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Exibindo os 20 mais votados de 1.078 candidaturas. Use a busca para localizar qualquer outro nome.</p> : null}
    </D.Panel>
  );
}

function MunSheet({ munId, result, race, nomes, uf, onClose, side, showProj }) {
  const m = result && result.muns.find(x => x.id === munId); if (!m) return null;
  const rows = AM.toRows(race, m.votes, m.projVotes);
  return (
    <D.Sheet open onClose={onClose} side={side} kicker={'Município · ' + uf.sigla + (m.capital ? ' · capital' : '')} title={nomes[munId] || String(munId)}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <D.Figure label="Apurado" value={m.apurado} unit="%" size="md" />
        <D.Figure label="Eleitores" value={fmtShort(m.eleitores)} size="md" />
      </div>
      {rows.slice(0, 8).map((r, i) => <D.CandidateRow key={r.id} rank={i + 1} name={r.nome} party={r.partido} pct={r.pct} projPct={r.projPct} delta={r.projPct - r.pct} showProj={showProj} compact={i >= 2} />)}
    </D.Sheet>
  );
}

/* ---------- App ---------- */
function App() {
  const desktop = useMedia('(min-width: 960px)');
  const [theme, setTheme] = uS(() => localStorage.getItem('am-theme') || 'light');
  uE(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('am-theme', theme); }, [theme]);
  const [cargo, setCargo] = uS('presidente');
  const [turno, setTurno] = uS(1);
  const [view, setView] = uS('parcial');
  const [ufSel, setUfSel] = uS(null);
  const [hover, setHover] = uS(null);
  const [munSel, setMunSel] = uS(null);
  const [ufPicker, setUfPicker] = uS(false);
  const [depQuery, setDepQuery] = uS('');
  const [geo, setGeo] = uS(null); const [nomes, setNomes] = uS({});
  const [hiRes, setHiRes] = uS({}); // codigo → FeatureCollection (IBGE malhas → tbrugz → q250 fallback)
  const hiResRef = uR({});
  uE(() => {
    const code = cargo === 'presidente' ? ufSel : 35; if (!code || hiResRef.current[code]) return;
    hiResRef.current[code] = 'loading';
    const rewind = f => { // IBGE rings are wound the wrong way for spherical d3.geoPath: flip any ring covering more than a hemisphere
      const fix = ring => d3.geoArea({ type: 'Polygon', coordinates: [ring] }) > 2 * Math.PI ? ring.slice().reverse() : ring;
      const g = f.geometry; if (!g) return f;
      if (g.type === 'Polygon') g.coordinates = g.coordinates.map((r, i) => i === 0 ? fix(r) : (d3.geoArea({ type: 'Polygon', coordinates: [r] }) > 2 * Math.PI ? r : r.slice().reverse()));
      if (g.type === 'MultiPolygon') g.coordinates = g.coordinates.map(poly => poly.map((r, i) => i === 0 ? fix(r) : (d3.geoArea({ type: 'Polygon', coordinates: [r] }) > 2 * Math.PI ? r : r.slice().reverse())));
      return f;
    };
    const norm = fc => ({ type: 'FeatureCollection', features: fc.features.map(f => rewind({ ...f, id: Number(f.properties.codarea || f.properties.id || f.id) })).filter(f => !isNaN(f.id)) });
    const tryFetch = async url => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return norm(await r.json()); };
    (async () => {
      let fc = null;
      try { fc = await tryFetch('https://servicodados.ibge.gov.br/api/v3/malhas/estados/' + code + '?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio'); }
      catch (e) { try { fc = await tryFetch('https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-' + code + '-mun.json'); } catch (e2) { fc = null; } }
      hiResRef.current[code] = fc || 'failed';
      if (fc) { setHiRes(h => ({ ...h, [code]: fc })); setNomes(n => { const add = {}; fc.features.forEach(f => { if (f.properties.name && !n[f.id]) add[f.id] = f.properties.name; }); return Object.keys(add).length ? { ...n, ...add } : n; }); }
    })();
  }, [cargo, ufSel]);
  uE(() => { (async () => {
    const [uf, mun, nm] = await Promise.all(['../../assets/geo/uf.json', '../../assets/geo/municipios.json', '../../assets/geo/municipio-nomes.json'].map(u => fetch(u).then(r => r.json())));
    setGeo({ uf: topojson.feature(uf, uf.objects.uf), mun: topojson.feature(mun, mun.objects.Munic) }); setNomes(nm);
  })(); }, []);
  const munIds = uM(() => { const o = {}; if (!geo) return o; geo.mun.features.forEach(f => { const c = Math.floor(f.id / 100000); (o[c] = o[c] || []).push({ id: f.id, c: d3.geoCentroid(f) }); });
    Object.keys(hiRes).forEach(c => { o[c] = hiRes[c].features.map(f => ({ id: f.id, c: d3.geoCentroid(f) })); }); return o; }, [geo, hiRes]);
  const showProj = view === 'proj';
  const SP = AM.UF_BY_SIGLA.SP;
  const stateUF = cargo === 'presidente' ? (ufSel ? AM.UF_BY_CODE[ufSel] : null) : SP;
  const level = stateUF ? stateUF.codigo : 'BR';

  // race for the map / lists
  const race = uM(() => {
    if (cargo !== 'deputado') return AM.RACES[cargo];
    const sum = AM.DEP_SP.reduce((a, c) => a + c.votos, 0);
    const cands = AM.DEP_SP.slice(0, 14).map((c, i) => i === 0 ? { ...c, pole: 'A' } : i === 1 ? { ...c, pole: 'B' } : { ...c, share: c.votos / sum * 100 * 0.42 });
    return { label: 'Dep. Federal', candidates: cands, marginUF: () => 1.4, colors: ['psol', 'pl'] };
  }, [cargo]);
  const effTurno = race.turno2 || cargo === 'presidente' ? turno : 1;
  const national = uM(() => cargo === 'presidente' && geo ? AM.nationalResult(effTurno, munIds) : null, [cargo, effTurno, geo]);
  const ufRes = uM(() => stateUF && geo ? AM.ufResult(stateUF, race, effTurno, munIds[stateUF.codigo]) : null, [stateUF, race, effTurno, geo]);
  const dep = uM(() => AM.deputyResult(), []);
  const rows = uM(() => stateUF && ufRes ? AM.toRows(race, ufRes.partial, ufRes.proj) : national ? national.rows : [], [stateUF, ufRes, national]);
  const [A, B] = race.candidates.filter(c => c.pole).sort((a, b) => a.pole < b.pole ? -1 : 1);
  const poleColors = race.colors || ['pt', 'pl'];
  const munIndex = uM(() => { const m = new Map(); ufRes && ufRes.muns.forEach(x => m.set(x.id, x)); return m; }, [ufRes]);

  const shade = f => {
    if (level === 'BR') {
      const r = national && national.perUF[AM.UF_BY_CODE[f.properties.codigo].sigla]; if (!r) return { apurado: 0, margin: 0, colorKey: poleColors[0] };
      const src = showProj ? r.proj : r.partial; const sum = Object.values(src).reduce((a, b) => a + b, 0);
      const margin = (src[A.id] - src[B.id]) / sum * 100; return { apurado: r.apurado, margin, colorKey: margin >= 0 ? poleColors[0] : poleColors[1] };
    }
    const m = munIndex.get(f.id); if (!m) return { apurado: 0, margin: 0, colorKey: poleColors[0] };
    const src = showProj ? m.projVotes : m.votes; const sum = Object.values(src).reduce((a, b) => a + b, 0) || 1;
    const margin = (src[A.id] - src[B.id]) / sum * 100; return { apurado: m.apurado, margin, colorKey: margin >= 0 ? poleColors[0] : poleColors[1] };
  };
  const hoverData = uM(() => {
    if (!hover) return null; const f = hover.f;
    if (level === 'BR') { const uf = AM.UF_BY_CODE[f.properties.codigo]; const r = national && national.perUF[uf.sigla]; if (!r) return null; const rs = AM.toRows(race, r.partial, r.proj); return { kicker: 'Unidade federativa', title: uf.nome, apurado: r.apurado, rows: rs.slice(0, 3).map(x => ({ name: x.nome, color: pc(x.partido), pct: x.pct, proj: x.projPct })) }; }
    const m = munIndex.get(f.id); if (!m) return null; const rs = AM.toRows(race, m.votes, m.projVotes);
    return { kicker: 'Município · ' + stateUF.sigla, title: nomes[f.id] || String(f.id), apurado: m.apurado, rows: rs.slice(0, 3).map(x => ({ name: x.nome, color: pc(x.partido), pct: x.pct, proj: x.projPct })) };
  }, [hover, level, national, munIndex, nomes]);

  const remaining = uM(() => {
    if (level === 'BR' && national) return Object.values(national.perUF).map(r => { const rs = AM.toRows(race, r.partial, r.proj); return { key: r.uf.sigla, name: r.uf.nome, apurado: r.apurado, remaining: r.total - r.counted, leader: rs.sort((a, b) => b.projPct - a.projPct)[0] }; }).sort((a, b) => b.remaining - a.remaining).slice(0, 5);
    if (ufRes) return ufRes.muns.map(m => { const rs = AM.toRows(race, m.votes, m.projVotes); const tot = Object.values(m.projVotes).reduce((a, b) => a + b, 0); return { key: m.id, name: nomes[m.id] || String(m.id), apurado: m.apurado, remaining: tot * (1 - m.apurado / 100), leader: rs.sort((a, b) => b.projPct - a.projPct)[0] }; }).sort((a, b) => b.remaining - a.remaining).slice(0, 5);
    return [];
  }, [level, national, ufRes, nomes, race]);

  const bulletin = uM(() => {
    const src = level === 'BR' && national ? Object.values(national.perUF).map(r => ({ name: r.uf.sigla, r })) : ufRes ? ufRes.muns.filter(m => m.eleitores > 80000).map(m => ({ name: nomes[m.id] || m.id, r: { apurado: m.apurado, partial: m.votes, proj: m.projVotes } })) : [];
    let min = 47; return src.sort((a, b) => b.r.apurado - a.r.apurado).slice(0, 6).map((s, i) => { const rs = AM.toRows(race, s.r.partial, s.r.proj); min -= 2 + Math.round(AM.rnd(s.name, 'bt') * 5); const t = '21:' + String(Math.max(0, min)).padStart(2, '0'); const lead = rs[0], sec = rs[1]; return { time: t, head: s.name + ' · ' + Math.round(s.r.apurado) + '% apurado.', text: lead.nome + ' ' + (s.r.apurado >= 95 ? 'fecha' : 'lidera') + ' com ' + fmtPct(lead.pct) + (sec ? ', ' + fmtPp(lead.pct - sec.pct) + ' sobre ' + sec.nome.split(' ')[0] : '') + (lead.projPct - lead.pct > 0.5 ? '; projeção aponta ampliação da margem.' : lead.projPct - lead.pct < -0.5 ? '; projeção aponta margem menor ao fim.' : '.') }; });
  }, [level, national, ufRes, race, nomes]);

  const apuradoAll = stateUF && ufRes ? ufRes.apurado : national ? national.apurado : 0;
  const scopeLabel = stateUF ? stateUF.nome : 'Brasil';
  const goBack = () => { setUfSel(null); setMunSel(null); setHover(null); };
  const pickCargo = c => { setCargo(c); setMunSel(null); setHover(null); setDepQuery(''); };
  const turnoOpts = [{ value: '1', label: '1º turno' }, { value: '2', label: '2º turno' }];
  const noSecond = !race.turno2 && cargo !== 'presidente';

  const mapBlock = (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: 'var(--surface-page)', overflow: 'hidden' }} onClick={() => setHover(null)}>
      {geo ? <window.MapView geo={geo} level={level} munFeatures={level !== 'BR' ? (hiRes[level] && hiRes[level].features) : null} shade={shade} selectedId={munSel} inset={desktop ? { top: 56, right: 24, bottom: 110, left: 24 } : { top: 44, right: 8, bottom: 84, left: 8 }} onHover={(f, pt) => setHover({ f, pt })} onLeave={() => setHover(null)}
        onSelect={f => { if (level === 'BR') { if (cargo === 'presidente') setUfSel(f.properties.codigo); } else setMunSel(f.id); setHover(null); }} /> : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: 'var(--type-data)', color: 'var(--text-muted)' }}>carregando mapa…</div>}
      <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
        {cargo === 'presidente' && stateUF ? <D.Button size="sm" variant="secondary" onClick={goBack} style={{ pointerEvents: 'auto', background: 'var(--surface-card)' }} icon={<Chevron size={14} />}>Brasil</D.Button> : null}
        <span style={{ ...K, color: 'var(--text-primary)', background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', padding: '6px 8px', borderRadius: 'var(--radius-sm)' }}>{stateUF ? stateUF.sigla : race.label + ' · Brasil'}{level !== 'BR' ? ' · ' + (munIds[level] || []).length + ' mun.' : ''}</span>
      </div>
      {cargo !== 'presidente' ? <div style={{ position: 'absolute', right: 12, top: 12 }}><D.Button size="sm" variant="secondary" onClick={() => setUfPicker(true)} style={{ background: 'var(--surface-card)' }}>São Paulo <Chevron dir="down" size={14} /></D.Button></div> : null}
      <div style={{ position: 'absolute', left: 12, bottom: 12, width: 200, background: 'var(--surface-card)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-sm)', padding: 10, pointerEvents: 'none' }}>
        <D.MapLegend left={A.nome.split(' ')[0]} right={B.nome.split(' ')[0]} />
      </div>
      {level === 'BR' && cargo === 'presidente' ? <div style={{ position: 'absolute', right: 12, bottom: 12, ...K, color: 'var(--text-muted)', pointerEvents: 'none' }}>toque em um estado para ver municípios</div> : null}
      {hover && hoverData ? <D.HoverCard x={hover.pt.x} y={hover.pt.y} flip={hover.pt.x > hover.pt.w * 0.55} {...hoverData} /> : null}
      {desktop && munSel && ufRes ? <MunSheet side munId={munSel} result={ufRes} race={race} nomes={nomes} uf={stateUF} onClose={() => setMunSel(null)} showProj={showProj} /> : null}
    </div>
  );

  const header = (
    <D.TopBar brand="Atlas Menna" subtitle={'Eleições 2026 · ' + (effTurno === 2 ? '2º turno' : '1º turno') + ' · ' + SNAP}
      right={<React.Fragment><D.LiveBadge>{apuradoAll ? Math.round(apuradoAll) + '% apurado' : 'ao vivo'}</D.LiveBadge>{desktop ? <D.ThemeToggle theme={theme} onChange={setTheme} /> : <button type="button" aria-label="Tema" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ width: 32, height: 32, borderRadius: 999, border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', font: 'var(--type-data)' }}>{theme === 'dark' ? '☾' : '☀'}</button>}</React.Fragment>}>
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 10px', alignItems: 'center' }}>
        {desktop ? <D.SegmentedControl size="sm" value={cargo} onChange={pickCargo} options={[{ value: 'presidente', label: 'Presidente' }, { value: 'governador', label: 'Governador' }, { value: 'senador', label: 'Senador' }, { value: 'deputado', label: 'Dep. Federal' }]} /> : null}
        <D.SegmentedControl size="sm" full={!desktop} value={String(turno)} onChange={v => setTurno(Number(v))} options={turnoOpts} style={{ opacity: noSecond ? 0.5 : 1, minWidth: 0, flex: desktop ? 'none' : 1 }} />
        <D.SegmentedControl size="sm" full={!desktop} value={view} onChange={setView} options={[{ value: 'parcial', label: 'Parcial' }, { value: 'proj', label: 'Projeção' }]} style={{ minWidth: 0, flex: desktop ? 'none' : 1 }} />
      </div>
    </D.TopBar>
  );

  const panels = (
    <div style={{ display: 'grid', gap: 28, padding: '16px 16px 32px' }}>
      {noSecond && turno === 2 ? <div style={{ padding: 12, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderRadius: 'var(--radius-sm)', font: 'var(--type-body-sm)' }}>{race.turno2note || AM.RACES[cargo].turno2note} Exibindo o resultado do turno único.</div> : null}
      {cargo === 'deputado' ? (
        <React.Fragment>
          <DeputiesPanel dep={dep} query={depQuery} setQuery={setDepQuery} onPick={() => {}} />
          <SeatsPanel seats={dep.seats} quociente={dep.quociente} vagas={dep.vagas} />
          {ufRes ? <BiggestPanel result={ufRes} race={race} nomes={nomes} onPick={setMunSel} showProj={showProj} /> : null}
          {ufRes ? <RemainingPanel items={remaining} unitLabel="município" /> : null}
        </React.Fragment>
      ) : (
        <React.Fragment>
          {rows.length ? <ResultPanel kicker={race.label + ' · ' + scopeLabel + (cargo === 'senador' ? ' · 1 vaga' : '')} title={showProj ? 'Projeção Atlas' : 'Resultado parcial'} rows={rows} apurado={apuradoAll} counted={stateUF && ufRes ? ufRes.counted : national ? national.counted : 0} total={stateUF && ufRes ? ufRes.total : national ? national.total : 1} showProj poles={cargo === 'presidente' || cargo === 'governador'} note={cargo === 'senador' ? 'Eleito o candidato mais votado; não há segundo turno para o Senado.' : 'Projeção por regra de três: votos apurados ÷ % apurado em cada município, somados por UF e país.'} /> : null}
          {cargo === 'presidente' && !stateUF && national ? <ChancesPanel rows={rows} apurado={apuradoAll} /> : null}
          {cargo === 'governador' && effTurno === 1 && rows.length ? <ChancesPanel rows={rows} apurado={apuradoAll} mode="gov" /> : null}
          {cargo === 'presidente' && !stateUF && national ? <StrongholdsPanel race={race} perUF={national.perUF} turno={effTurno} /> : null}
          {stateUF && ufRes ? <BiggestPanel result={ufRes} race={race} nomes={nomes} onPick={setMunSel} showProj={showProj} /> : null}
          {remaining.length ? <RemainingPanel items={remaining} unitLabel={level === 'BR' ? 'UF' : 'município'} /> : null}
          {bulletin.length ? <BulletinPanel items={bulletin} /> : null}
        </React.Fragment>
      )}
      <p style={{ margin: 0, font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', borderTop: '1px solid var(--border-hairline)', paddingTop: 12, textWrap: 'pretty' }}>Protótipo com dados simulados. Candidaturas conforme registros no TSE encerrados em 15 ago 2026. Projeção = regra de três por município, sem ponderação demográfica. Percentuais sobre votos válidos.</p>
    </div>
  );

  const ufPickerSheet = ufPicker ? (
    <D.Sheet open onClose={() => setUfPicker(false)} kicker="Escolher UF" title={race.label} side={desktop}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6 }}>
        {AM.UF.slice().sort((a, b) => a.nome.localeCompare(b.nome)).map(u => { const on = u.sigla === 'SP'; return <button key={u.sigla} type="button" disabled={!on} onClick={() => setUfPicker(false)} style={{ height: 40, padding: '0 10px', border: '1px solid ' + (on ? 'var(--border-strong)' : 'var(--border-hairline)'), borderRadius: 'var(--radius-sm)', background: on ? 'var(--surface-inverse)' : 'transparent', color: on ? 'var(--text-inverse)' : 'var(--text-muted)', font: 'var(--type-body-sm)', textAlign: 'left', cursor: on ? 'pointer' : 'not-allowed', display: 'flex', justifyContent: 'space-between' }}><span>{u.nome}</span><span style={{ font: 'var(--type-figure-sm)' }}>{u.sigla}</span></button>; })}
      </div>
      <p style={{ margin: '12px 0 0', font: 'var(--type-body-sm)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>No protótipo, candidaturas estaduais estão carregadas apenas para São Paulo.</p>
    </D.Sheet>
  ) : null;

  if (desktop) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'var(--sidebar-w) 1fr', height: '100vh', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: '1px solid var(--border-strong)' }}>
        {header}
        <div style={{ overflowY: 'auto', flex: 1 }}>{panels}</div>
      </div>
      <div style={{ position: 'relative', minWidth: 0 }}>{mapBlock}{ufPickerSheet}</div>
    </div>
  );
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', maxWidth: 'var(--mobile-max)', margin: '0 auto', borderLeft: '1px solid var(--border-hairline)', borderRight: '1px solid var(--border-hairline)' }}>
      {header}
      <div style={{ height: '52vh', minHeight: 400, borderBottom: '1px solid var(--border-strong)' }}>{mapBlock}</div>
      <div style={{ flex: 1 }}>{panels}</div>
      <D.TabBar value={cargo} onChange={pickCargo} items={[{ value: 'presidente', label: 'Presidente' }, { value: 'governador', label: 'Governador' }, { value: 'senador', label: 'Senador' }, { value: 'deputado', label: 'Deputado' }]} />
      {munSel && ufRes ? <MunSheet munId={munSel} result={ufRes} race={race} nomes={nomes} uf={stateUF} onClose={() => setMunSel(null)} showProj={showProj} /> : null}
      {ufPickerSheet}
    </div>
  );
}
window.AtlasApp = App;
