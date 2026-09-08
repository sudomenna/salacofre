Detail overlay. Mobile: bottom sheet with scrim. Desktop (`side`): floating card pinned to the map's top-right.
```jsx
<Sheet open={!!mun} onClose={()=>setMun(null)} kicker="Município · SP" title="Campinas">…</Sheet>
```