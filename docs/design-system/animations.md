---
title: Animações
description: Agulha (spring CSS), transições de cor no mapa, contadores animados, entrada de componentes, reduced-motion
status: stable
source: PRD.md § 16
---

# Animações

**S07 Bloco 0**: Framer Motion foi removida (zero imports reais). Animações agora usam CSS puro com transições Tailwind e keyframes customizadas.

## Agulha (`<Needle />`)

```tsx
export function Needle({ position }: { position: number }) {
  // position: número normalizado -1..1 (mapeado a rotação -90..90 graus)
  const rotation = (position * 90); // em graus

  return (
    <svg viewBox="0 0 200 100" aria-label={`Agulha indicando ${position}`}>
      <BandSemicircle />
      <line
        x1="100" y1="100" x2="100" y2="20"
        stroke="#222" strokeWidth="3"
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: '100px 100px',
          transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' // spring via cubic-bezier
        }}
      />
    </svg>
  );
}
```

**Justificativa do spring**: replicar comportamento do NYT, que "balança" antes de se acomodar — comunica visualmente a incerteza do modelo. O easing `cubic-bezier(0.34, 1.56, 0.64, 1)` simula uma mola com overshoot suave.

## Transições de cor no mapa

```ts
map.setPaintProperty('municipios-fill', 'fill-color-transition', {
  duration: 600,
  delay: 0
});
```

MapLibre gerencia a transição nativamente — aplicada no layer, não em CSS.

## Números animados (contadores)

```tsx
export function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  // `display` NÃO entra nas deps: ele muda a cada frame e reiniciaria o efeito
  // em loop. O valor de partida é lido do ref, que o próprio efeito mantém.
  const displayRef = useRef(value);
  displayRef.current = display;

  useEffect(() => {
    const start = displayRef.current;
    const diff = value - start;
    const steps = 30; // ~30 frames @ 60fps = 500ms
    let step = 0;

    const interval = setInterval(() => {
      step++;
      setDisplay(step >= steps ? value : Math.round(start + (diff * step) / steps));
      if (step >= steps) clearInterval(interval);
    }, 1000 / 60);

    return () => clearInterval(interval);
  }, [value]);

  return (
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
      {display.toLocaleString('pt-BR')}
    </span>
  );
}
```

Sem CSS aqui — o incremento é computado em JS e renderizado a cada frame. Sem transição CSS, porque o valor é discreto (número inteiro).

## Entrada de componentes

| Componente | Animação | Duração |
|---|---|---|
| Página | Fade in 0→1 via `opacity` Tailwind | 200ms |
| Cards de UFs decisivas | Stagger fade-up (delay-escalado + `translate-y` → 0) | 400ms total |
| Linhas de tabela | Sem animação (perf) | — |
| WinnerBanner | Scale 0.95→1 + fade via `transform` + `opacity` | 400ms |

Implementação com Tailwind:

```tsx
<div className="opacity-0 translate-y-4 animate-fade-in">...</div>
```

Onde `animate-fade-in` é uma keyframe customizada em `app/globals.css` (não em `tailwind.config.ts` — há `@keyframes` nativo CSS).

## Reduced Motion (RNF-026)

Declarado em `app/globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Comportamento por componente**:

- **Agulha**: snap direto ao valor, sem spring (transição desabilitada).
- **Contadores**: incrementam instantaneamente (sem intervalo).
- **Transições de mapa**: anuladas (duração 0.01ms).
- **Entrada de page**: snap (sem fade-in).

## Cross-refs

- NFR a11y (RNF-026): [../nfr/accessibility.md](../nfr/accessibility.md)
- Constituição § 4: [../constitution.md](../constitution.md#4-acessibilidade-wcag-21-aa)
- Tokens de cores: [./tokens.md](./tokens.md)
