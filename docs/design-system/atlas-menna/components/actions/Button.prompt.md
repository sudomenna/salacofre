Editorial button; use `primary` for the one main action on a screen, `secondary` for alternatives, `ghost` inside dense panels.
```jsx
<Button variant="primary">Ver município</Button>
<Button variant="secondary" size="sm" icon={<Search size={14} />}>Buscar</Button>
```
Variants: primary (ink fill), secondary (hairline), ghost (text), accent (ochre — only for "projeção" related CTAs). Sizes: sm (32px), md (44px, mobile tap target). `full` stretches.