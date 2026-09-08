Segmented tabs for mutually exclusive views (Parcial / Projeção, 1º / 2º turno, cargo).
```jsx
<SegmentedControl value={view} onChange={setView} options={[{value:"parcial",label:"Parcial"},{value:"proj",label:"Projeção"}]} />
```
Uppercase labels, ink-filled active. `size="sm"` for in-panel toggles.