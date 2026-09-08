Stacked share-of-valid-votes bar (NYT/AP style) with a 50% line.
```jsx
<VoteBar segments={[{label:"Lula",party:"PT",pct:41.2},{label:"Flávio",party:"PL",pct:36.8},{label:"Outros",pct:22,color:"var(--party-outros)"}]} />
```
Put the two leaders at the ends and "Outros" in the middle when you want the 50% marker to read as a finish line.