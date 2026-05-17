---
title: Animações
description: Agulha (spring), transições de cor no mapa, contadores animados, entrada de componentes, reduced-motion
status: stable
source: PRD.md § 16
---

# Animações

## Agulha (`<Needle />`)

```tsx
import { motion, useTransform, useSpring } from 'framer-motion';

export function Needle({ position }: { position: number }) {
  const spring = useSpring(position, {
    stiffness: 60,
    damping: 18,
    mass: 1
  });
  const rotation = useTransform(spring, [-1, 1], [-90, 90]);

  useEffect(() => { spring.set(position); }, [position]);

  return (
    <svg viewBox="0 0 200 100" aria-label={`Agulha indicando ${position}`}>
      <BandSemicircle />
      <motion.line
        x1="100" y1="100" x2="100" y2="20"
        stroke="#222" strokeWidth="3"
        style={{ rotate: rotation, originX: '100px', originY: '100px' }}
      />
    </svg>
  );
}
```

**Justificativa do spring**: replicar comportamento do NYT, que "balança" antes de se acomodar — comunica visualmente a incerteza do modelo.

## Transições de cor no mapa

```ts
map.setPaintProperty('municipios-fill', 'fill-color-transition', {
  duration: 600,
  delay: 0
});
```

## Números animados (contadores)

```tsx
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';

export function AnimatedNumber({ value }: { value: number }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => v.toLocaleString('pt-BR'));

  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.8, ease: 'easeOut' });
    return controls.stop;
  }, [value]);

  return <motion.span>{text}</motion.span>;
}
```

## Entrada de componentes

| Componente | Animação | Duração |
|---|---|---|
| Página | Fade in 0→1 | 200ms |
| Cards de UFs decisivas | Stagger fade-up 50ms cada | 400ms total |
| Linhas de tabela | Sem animação (perf) | — |
| WinnerBanner | Scale 0.95→1 + fade | 400ms |

## Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Agulha**: snap direto ao valor, sem spring.

## Cross-refs

- NFR a11y (RNF-026): [../nfr/accessibility.md](../nfr/accessibility.md)
- Constituição § 4: [../constitution.md](../constitution.md#4-acessibilidade-wcag-21-aa)
