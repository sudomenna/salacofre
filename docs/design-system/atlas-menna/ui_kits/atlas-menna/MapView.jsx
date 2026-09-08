/* Choropleth map (d3-geo + TopoJSON). Renders Brazil UFs or one UF's municípios. */
const { useEffect, useMemo, useRef, useState } = React;

function marginBucket(m) { const a = Math.abs(m); return a < 1 ? 0 : a < 3 ? 1 : a < 8 ? 2 : a < 15 ? 3 : a < 30 ? 4 : 5; }
function fillFor(colorKey, bucket) {
  if (bucket === 0) return 'var(--party-tie)';
  if (colorKey === 'pt' || colorKey === 'pl') return 'var(--party-' + colorKey + '-' + bucket + ')';
  const p = [0, 22, 40, 60, 80, 100][bucket];
  return 'color-mix(in srgb, var(--party-' + colorKey + ') ' + p + '%, var(--surface-card))';
}

function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  return size;
}

/** geo: {uf: FeatureCollection, mun: FeatureCollection}; level: 'BR' | codigo; shade(id) → {colorKey, margin, apurado} */
function MapView({ geo, level, munFeatures, shade, onHover, onLeave, onSelect, selectedId, labels = true, inset = { top: 8, right: 8, bottom: 8, left: 8 }, style }) {
  const ref = useRef(null); const { w, h } = useSize(ref);
  const feats = useMemo(() => {
    if (!geo) return [];
    if (level === 'BR') return geo.uf.features;
    if (munFeatures && munFeatures.length) return munFeatures;
    return geo.mun.features.filter(f => Math.floor(f.id / 100000) === level);
  }, [geo, level, munFeatures]);
  const outline = useMemo(() => geo && level !== 'BR' ? geo.uf.features.find(f => f.properties.codigo === level) : null, [geo, level]);
  const path = useMemo(() => {
    if (!w || !h || !feats.length) return null;
    const fc = { type: 'FeatureCollection', features: outline ? [outline] : feats };
    const proj = d3.geoMercator().fitExtent([[inset.left, inset.top], [Math.max(inset.left + 10, w - inset.right), Math.max(inset.top + 10, h - inset.bottom)]], fc);
    return d3.geoPath(proj);
  }, [w, h, feats, outline, inset.top, inset.right, inset.bottom, inset.left]);
  const move = (e, f) => { const r = ref.current.getBoundingClientRect(); onHover && onHover(f, { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }); };
  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height: '100%', ...style }}>
      {path ? (
        <svg width={w} height={h} style={{ display: 'block' }} onMouseLeave={() => onLeave && onLeave()}>
          <g key={level + (munFeatures ? 'h' : 'q')} style={{ animation: 'am-fade var(--dur-base) var(--ease-out)' }}>
            {feats.map(f => {
              const s = shade(f); const bucket = s.apurado <= 0 ? -1 : marginBucket(s.margin);
              const fill = bucket < 0 ? 'var(--map-uncounted)' : fillFor(s.colorKey, bucket);
              const sel = selectedId != null && (f.id === selectedId || f.properties.codigo === selectedId);
              return (
                <path key={f.id || f.properties.codigo} d={path(f)} fill={fill}
                  stroke={sel ? 'var(--map-stroke-focus)' : 'var(--map-stroke)'} strokeWidth={sel ? 1.6 : level === 'BR' ? 0.9 : 0.45}
                  style={{ cursor: 'pointer', transition: 'fill var(--dur-base)' }}
                  onMouseMove={e => move(e, f)} onMouseEnter={e => move(e, f)} onClick={e => { e.stopPropagation(); onSelect && onSelect(f); }} />
              );
            })}
            {outline ? <path d={path(outline)} fill="none" stroke="var(--border-strong)" strokeWidth={1} pointerEvents="none" /> : null}
            {labels && level === 'BR' ? feats.map(f => { const c = path.centroid(f); const b = path.bounds(f); const sg = window.AM_DATA.UF_BY_CODE[f.properties.codigo]; if (!sg || isNaN(c[0]) || (b[1][0] - b[0][0]) < 26) return null; return (
              <text key={'l' + f.properties.codigo} x={c[0]} y={c[1]} textAnchor="middle" dominantBaseline="middle" pointerEvents="none"
                style={{ font: 'var(--type-data)', fontSize: 10, fontWeight: 600, fill: 'var(--text-primary)', paintOrder: 'stroke', stroke: 'var(--surface-card)', strokeWidth: 2.5, strokeLinejoin: 'round' }}>{sg.sigla}</text>
            ); }) : null}
          </g>
        </svg>
      ) : <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: 'var(--type-data)', color: 'var(--text-muted)' }}>carregando geometria…</div>}
    </div>
  );
}
window.MapView = MapView; window.marginBucket = marginBucket; window.fillFor = fillFor;
