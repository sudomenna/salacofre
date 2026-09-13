/**
 * lib/state/dado-freshness-store.ts
 *
 * **O relógio do dado, vivo no cliente.** O que falta ao
 * [ADR-0038](../../docs/architecture/adrs/0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md)
 * D4 para valer também para quem já está com a página aberta.
 *
 * ## O buraco que esta store fecha
 *
 * D4 manda calcular o gatilho do banner **no servidor**, a partir do `dado_ts`
 * que já veio no JSON — e é o que as cinco superfícies fazem (ex.
 * `app/(pres)/page.tsx:286`). Só que **quatro das rotas são ISR-60 e uma é
 * estática pura, e nenhuma das duas coisas ajuda uma aba já aberta**: ISR só
 * decide o que uma requisição **nova** recebe, e quem já está na página não
 * emite requisição nenhuma. O veredito dela é o do render que a serviu —
 * calculado **uma vez** e nunca mais. Para quem abriu a página às 20h e
 * continua nela, a ingestão pode morrer às 20h30 que o aviso não aparece — e a
 * tela ainda *parece viva*, porque
 * `components/layout/PersistentMapFrame.tsx:132` repinta a moldura do mapa a
 * cada 60 s. É o mesmo defeito que o ADR-0038 existe para consertar (um relógio
 * fresco por cima de dado parado), uma camada acima: agora é o **veredito** que
 * está congelado, não o carimbo.
 *
 * ## Por que uma store, e não um `setInterval` dentro do banner
 *
 * O banner sozinho não pode resolver isso. Se ele reavaliar por tempo em cima
 * do `dado_ts` que veio do servidor — que é fixo —, o lag cresce para sempre e
 * o aviso acende **falsamente** em toda página aberta por mais que o limiar do
 * cargo: um alarme falso recorrente, pior que o defeito atual. O frescor só
 * pode ser reavaliado contra o `dado_ts` **mais recente que alguém buscou**.
 *
 * E quem já busca não é o banner: é o `<PersistentMapFrame>`, montado pelo
 * `layout.tsx` do grupo de rotas (`app/(pres)/layout.tsx`, `app/(gov)/layout.tsx`,
 * ADR-0033 § 1). Ele faz `GET /api/projection` a cada 60 s e o `EdgePayload` que
 * recebe **já carrega `dado_ts`** (`lib/edge-config/types.ts:570`). Nenhuma
 * requisição nova, nenhuma query nova — só um dado que já estava na mão e era
 * jogado fora.
 *
 * Moldura e banner são árvores React **irmãs** (a moldura vem do `layout.tsx`,
 * o banner do `page.tsx`), sem pai comum montável no cliente — exatamente a
 * situação que já produziu `components/shared/municipio-sheet-store.ts`. Mesmo
 * remédio, mesma biblioteca, mesmo formato de `lib/state/hover-store.ts`: store
 * Zustand de módulo, selector fino no consumidor. Contexto React não serve pelo
 * mesmo motivo de sempre — o Provider teria que ser ancestral cliente das duas
 * colunas, e `AppShellSplit` é Server Component.
 *
 * ## Dois sinais, não um
 *
 * `pollers` e `relogios` respondem perguntas diferentes, e colapsá-las num
 * campo só reintroduz o alarme falso:
 *
 *   - **`pollers[cargo]`** — "existe nesta página alguém buscando este cargo?".
 *     É o que **autoriza** o banner a reavaliar por tempo. Sem poller (as duas
 *     telas de Deputado Federal, que não têm moldura), o banner fica com o
 *     veredito do servidor e pronto: um timer ali só produziria alarme falso,
 *     porque nada nunca traria um `dado_ts` novo.
 *   - **`relogios[cargo]`** — o último `dado_ts` que esse poller de fato
 *     entregou. Pode não existir mesmo com poller montado: o primeiro `fetch`
 *     ainda está em voo, ou toda requisição está falhando (o `catch` de
 *     `PersistentMapFrame.tsx:126-129` é silencioso de propósito). Nesse caso o
 *     último `dado_ts` conhecido é o do servidor e **continua valendo**, com o
 *     relógio de parede andando por cima — se a página não consegue mais
 *     confirmar que o dado avança, acabar acendendo o aviso é o desfecho certo,
 *     não um bug.
 *
 * ## `string` | `null` | `undefined` continuam sendo três estados
 *
 * `dadoTs` viaja **cru**, como `avaliarFrescorDado` exige
 * (`lib/config/dado-freshness.ts:175`): `undefined` é "o produtor não conhece o
 * campo" (payload em voo durante o canary), `null` é "o produtor conhece e não
 * tinha o que pôr" (ciclo sem `dg`/`hg` parseável), e os dois pedem textos
 * diferentes. É por isso que `relogios[cargo]` guarda um **objeto invólucro** em
 * vez do valor solto: `relogios[cargo] === undefined` ("ninguém publicou ainda")
 * teria colidido com `{ dadoTs: undefined }` ("publicou, e o payload não tem o
 * campo") se o valor morasse direto no mapa. É o mesmo `??` silencioso que o
 * ADR-0038 D1 proíbe no payload, só que no estado do cliente.
 */

import { create } from "zustand";

import type { CargoTse } from "@/lib/config/cargos";

/** O último payload que um poller vivo entregou para um cargo. */
interface RelogioDoDado {
  /**
   * `payload.dado_ts` **sem coalescer** — ver o § "três estados" acima. O
   * invólucro existe só para que "ainda não publicou" seja distinguível de
   * "publicou `undefined`".
   */
  dadoTs: string | null | undefined;
}

interface DadoFrescorState {
  /**
   * Quantos pollers estão montados por cargo. **Contagem, não booleano**: o
   * StrictMode monta e desmonta cada efeito duas vezes em desenvolvimento, e um
   * booleano desligaria na primeira limpeza — o banner voltaria ao veredito do
   * servidor sem que nada tivesse desmontado de verdade.
   */
  pollers: Partial<Record<CargoTse, number>>;
  relogios: Partial<Record<CargoTse, RelogioDoDado>>;
  /** Anuncia um poller vivo. Devolve a função de baixa, para o `cleanup`. */
  registrarPoller: (cargo: CargoTse) => () => void;
  /** Publica o `dado_ts` do payload recém-buscado. Cru, sem `??`. */
  publicarDadoTs: (cargo: CargoTse, dadoTs: string | null | undefined) => void;
}

export const useDadoFrescorStore = create<DadoFrescorState>((set) => ({
  pollers: {},
  relogios: {},

  registrarPoller: (cargo) => {
    set((s) => ({ pollers: { ...s.pollers, [cargo]: (s.pollers[cargo] ?? 0) + 1 } }));
    let baixado = false;
    return () => {
      // Idempotente: uma baixa chamada duas vezes (StrictMode, ou um `cleanup`
      // que o React reexecuta) não pode zerar a contagem de um poller que
      // continua vivo.
      if (baixado) return;
      baixado = true;
      set((s) => {
        const restantes = (s.pollers[cargo] ?? 1) - 1;
        const pollers = { ...s.pollers };
        if (restantes > 0) pollers[cargo] = restantes;
        else delete pollers[cargo];
        return { pollers };
      });
    };
  },

  publicarDadoTs: (cargo, dadoTs) =>
    set((s) => {
      const atual = s.relogios[cargo];
      // Devolver o MESMO objeto de estado é o que faz o Zustand não notificar
      // ninguém (`Object.is` no `setState`). Sem esta guarda, todo ciclo de 60 s
      // rerrenderizaria o banner mesmo quando o TSE não publicou nada novo —
      // que é justamente o cenário em que ele não deve piscar.
      if (atual && atual.dadoTs === dadoTs) return s;
      return { relogios: { ...s.relogios, [cargo]: { dadoTs } } };
    }),
}));
