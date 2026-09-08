# Atlas Menna — UI kit (protótipo)

`index.html` monta o app completo. Estado em `App.jsx`; mapa d3/TopoJSON em `MapView.jsx`; dados simulados e motor de projeção em `data.js`.

Telas / estados cobertos
1. Home = Presidente · Brasil: apurado, margem, barra de válidos, 13 candidatos, chances (2º turno / vitória no 1º), "Onde cada candidato é mais forte" (top 5 × 10 UFs), "Votos que ainda faltam", Boletim.
2. Presidente · UF (toque no estado): mapa de municípios, resultado da UF, maiores colégios, faltam votos, boletim local.
3. Município (toque no município): bottom sheet (mobile) / card lateral (desktop) com todos os candidatos, parcial + projeção.
4. Governador · SP, 5. Senador · SP (1 vaga, barra proporcional), 6. Deputado Federal · SP (top 20 + busca, cadeiras por partido, quociente).
7. Toggle Parcial / Projeção (recolore o mapa e as listas), 8. 1º / 2º turno (presidente e governador; aviso para cargos de turno único), 9. Tema claro/escuro, 10. Seletor de UF (só SP habilitado no protótipo).
Desktop ≥960px: duas colunas (painéis + mapa grande).
