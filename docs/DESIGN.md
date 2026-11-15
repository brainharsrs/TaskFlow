# Design system — "Tinta & Lima"

Arquivo no Figma: <https://www.figma.com/design/WhHsSgmG8ws6GgWgo5sTlQ> (comparação das três paletas, 30 variáveis de token e capturas das telas implementadas).

## A logo é intocável

A marca original é um SVG inline (check + traço) sobre um quadrado com gradiente violeta `#b5a4ff → #7757f4 → #5335cc`, mais o wordmark `task` + `flow` + `.` em Space Grotesk. Markup e CSS foram preservados valor por valor e isolados em [`css/logo.css`](../css/logo.css), com as variáveis antigas trocadas pelos seus valores literais para que nenhum tema consiga alterá-la. Space Grotesk é carregada **só** para o wordmark. A única coisa removida foi a flutuação em loop do símbolo, que é movimento, não aparência.

## Direção criativa

Três paletas foram comparadas a partir da logo:

| Opção | Relação com a marca | Veredito |
|-------|--------------------|----------|
| A · Violeta nativo | Análoga: fundo azul-noite, acento violeta | Descartada: a logo se dissolve no entorno e o conjunto repete o violeta genérico de templates de IA. |
| **B · Tinta & Lima** | **Complementar:** lima a ~180° do violeta no círculo cromático | **Escolhida.** |
| C · Papel & Brasa | Contrastante: fundo claro quente, laranja triádico | Descartada: três matizes disputando atenção; vidro perde profundidade em fundo claro. |

Por que a B: o chrome é acromático, então **a logo é o único elemento violeta da tela** e ganha presença por contraste simultâneo com o lima. O lima fica reservado à ação primária e ao dado principal (anel de hoje, barra de hoje, tarefa em foco) — menos de 2% dos pixels. O violeta reaparece só como luz ambiente atrás do vidro.

## Tokens ([`css/tokens.css`](../css/tokens.css))

| Papel | Token | Valor | Contraste |
|-------|-------|-------|-----------|
| Fundo | `--ink-0` | `#0a0a0c` | — |
| Superfície / elevada / controle | `--ink-1` / `--ink-2` / `--ink-3` | `#111114` / `#18181c` / `#212126` | degraus de tom, sem linhas |
| Texto | `--text` | `#f4f4f1` | 17,9:1 sobre o fundo |
| Texto secundário | `--text-2` | `#b4b4bc` | 9,2:1 |
| Meta | `--text-3` | `#85858f` | 5,2:1 (4,9:1 sobre `--ink-2`) |
| Acento | `--lime` | `#c8f751` | 15,9:1; texto sobre lima `#141a00` = 14,3:1 |
| Sucesso / atenção / erro / info | `--success` `--warning` `--danger` `--info` | `#5fd9a0` `#f7b955` `#ff6b6b` `#6cc4f5` | todos ≥ 6,8:1 |
| Espaços | Pessoal / Estudos / Projetos | violeta / azul / âmbar | sempre com o nome ao lado |

- **Tipografia:** Geist (variável, 400–700). Escala 13 / 14 / 15 / 18 / 24 / 32 e um display fluido. Tracking negativo só em títulos; números tabulares em contagens.
- **Espaço:** base 4. **Raios:** 8, 12, 20, 28 e pílula.
- **Sombras:** só no que flutua (sidebar, barras, sheet, popovers, toasts).
- **Gradientes:** apenas luz ambiente e brilho do vidro; nunca em botões ou texto.

## Vidro (adaptação do Expo Glass)

O `expo-glass-effect` não está instalado no ambiente e é uma biblioteca React Native (Liquid Glass do iOS 26); o TaskFlow é web estático. Em vez de migrar de stack por um efeito, os princípios foram reproduzidos em CSS ([`css/components.css`](../css/components.css), classe `.glass`):

1. **Camada translúcida** — `backdrop-filter: blur(26px) saturate(175%)` sobre o conteúdo que rola por baixo.
2. **Aresta especular** — luz interna no topo e sombra na base.
3. **Brilho que acompanha o ponteiro** — `data-sheen`, só em dispositivos com mouse.
4. **Luz ambiente** — dois campos (violeta e lima) fixos atrás de tudo, para o vidro ter o que refratar.

Vidro é **só chrome flutuante**: sidebar, barra superior, barra inferior do celular, sheet, popovers e toasts. Cartões de conteúdo são opacos. `prefers-reduced-transparency` e `prefers-contrast: more` trocam o vidro por superfícies sólidas.

## Movimento ([`js/ui/motion.js`](../js/ui/motion.js))

Molas calculadas a partir de um oscilador amortecido e exportadas como `linear()` — as mesmas curvas servem ao CSS e à Web Animations API.

| Momento | Movimento |
|---------|-----------|
| Concluir tarefa | check se desenha, título é riscado, 8 partículas, depois a linha sai e as vizinhas deslizam (FLIP) |
| Criar / reordenar / excluir | FLIP: só o que mudou se move |
| Trocar de visão | lista entra em cascata (45 ms por item) |
| Navegação | pílula deslizante na sidebar, na barra inferior e nos controles segmentados |
| Sheet e popovers | materializam (escala + blur + opacidade) a partir de quem os abriu; no celular o sheet sobe de baixo e pode ser arrastado para fechar |
| Indicadores | anel e barras crescem com mola; números contam |
| Pressionar | `scale(0.97)` no pointer-down |

Só `transform` e `opacity`. Com `prefers-reduced-motion` nada viaja: os estados finais aparecem direto e as mudanças de cor permanecem.

## Desvios deliberados da skill taste-skill

A direção sorteada ("Achromatic ledger") proíbe vidro, gradientes e sombras. O pedido exigia vidro e profundidade, então mantive da skill o chrome acromático, o orçamento mínimo de cor, a ausência de rótulos em caixa alta, de emoji e de números decorativos, e os dados sempre reais — e contrariei as três proibições, restritas ao chrome flutuante.
