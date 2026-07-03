# 🐾 Os 11 do Bairro

Um jogo de aventura ambientado em um bairro tranquilo de uma cidade do interior do Brasil — na casa onde vivem **11 gatos**, cada um com personalidade, cores, história e manias próprias, e as duas humanas que cuidam de todos eles.

Ruas de paralelepípedo, quintais com pé de manga, cheiro de café passado, o Tiqueno gritando por sachê no pé da cama... e um mistério rondando a garagem.

## 🎮 Como jogar

**Jogue online:** https://dynosaisistemas-blip.github.io/jogo-code/

Ou localmente — tudo em HTML puro, sem dependências. Basta abrir no navegador:

```bash
# abra diretamente
open index.html        # macOS
xdg-open index.html    # Linux

# ou sirva localmente
python3 -m http.server 8000
# e acesse http://localhost:8000
```

### 🕹️ Modo aventura (`index.html`)

Você **controla um dos 11 gatos** e explora a casa toda: garagem, sala, cozinha, os dois quartos, a área de serviço e o quintal — agora com cenário todo ilustrado (pisos, móveis, pé de manga, varal, janela do Zé…), efeitos sonoros, tempestade com raio e uma **setinha dourada** que sempre aponta o próximo objetivo.

- **Andar:** setas do teclado ou WASD (no celular: botões de toque ▲▼◀▶)
- **Correr (zoomies!):** segure **Shift** (no celular: continue andando que o gato engata a corrida)
- **Agir/conversar:** tecla **E**, Espaço ou Enter (no celular: botão 🐾)
- **Miar:** tecla **M** (no celular: botão 🎵) — todos os gatos e as humanas reagem ao seu miado, cada um do seu jeito
- **Pular:** tecla **P** (no celular: botão ⤴️) — o bote felino que captura bichinhos
- Converse com os outros 10 gatos e as humanas — os gatos passeiam pela casa, pensam alto e reagem a você

**O jogo tem 3 fases:**

1. **🗑️ O Mistério da Garagem** — investigue a lixeira, junte as pistas, consiga o sachê, sobreviva à tempestade e resgate a **Paçoca**
2. **🐭 A Invasão dos Ratos** — 5 ratos de brinquedo soltos pela casa: capture todos com o pulo, contra o relógio (bônus se fizer em até 90s!)
3. **🍽 O Banquete dos 11** — hora do jantar: pegue a comida no balcão e sirva cada um dos gatos da casa, um por um

Ao terminar uma fase, aperte o botão **▶** na tela de vitória — ou fale com a **Paçoca** (ela fica na cozinha) para começar a próxima!

**Tudo vale pontos ⭐** (com recorde salvo no navegador) e vira conquista na tela final:

- 🍪 Colete os 8 petiscos escondidos pelos cômodos (+10)
- 🐭 Cace o rato de brinquedo — ele foge de você e reaparece em outro cômodo (+50 por captura)
- 🦋 Capture as 3 borboletas do quintal pulando (+25)
- 🦎 Pegue a lagartixa mais veloz do bairro (+50)
- 🐦 O bote lendário: chegue devagar no passarinho e pule — no ar, ele não te vê (+80, e ele sai ileso: regra de ouro)
- 🏃 Desafie a Popoia no **pique-pega**: encoste nela 3 vezes em 25 segundos (+100)
- 😴 Acorde o Sebastian miando 3 vezes do lado da cama — um milagre doméstico (+50)
- 😾 **Cuidado com o Zé!** Chegue perto da janela dele (ou mie) e ele te caça pela sala. Fuja correndo por uma porta para despistá-lo (+30)… ou leve uma patada (−20)
- ✉️ **Recados:** de tempos em tempos um gato tem um recado para outro — pegue e entregue em 30 segundos para o bônus expresso (+60; fora do prazo, +40). Missões-relâmpago infinitas!
- 🌿 **Erva-do-gato:** aparece escondida pela casa — pegue e ganhe 8 segundos de ZOOMIES (velocidade máxima com rastro verde)

O jogo tem música de fundo suave e efeitos sonoros, tudo sintetizado no navegador (botão 🔊 para silenciar). Os avisos de conquista aparecem como faixas rápidas no topo da tela, sem interromper a ação.

### 📖 Modo história (`historia.html`)

Aventura de texto com escolhas: você escolhe um dos 11 gatos (ou a Flávia/Ana), escolhe a aventura do dia — 🗑️ O Mistério do Lixo Derrubado, 🧺 O Dia do Veterinário ou 🐈‍⬛ O Gato Desconhecido do Muro — e vive a história por 3 opções numeradas + ações livres digitadas.

**Regra de ouro (nos dois modos):** nenhum gato morre nem se machuca gravemente. Todos os 11 sempre voltam para casa, juntos. ❤️

## 🐈 O elenco

| Gato | Quem é |
|---|---|
| **Lilica** 👑 | A matriarca. Foi a mais braba; hoje, mansa pela doença renal, é a sabedoria da casa. |
| **Lourinho** 🧸 | Urso de pelúcia medroso, pai de quase todos. Só não abaixa a cabeça para o Zé. |
| **Pomporita (Popoia)** 🌀 | Elétrica, doida e manhosa. Nem ela sabe o que vai fazer em seguida. |
| **Jaime** 🌙 | Magrelo do mundo da lua. Pânico do Zé. Único que passa pela brecha da janela. |
| **Zé** 😾 | O valentão da janela (cabeça pra fora, bunda balançando). Será que tem um lado que ninguém conhece? |
| **Sebastian** 😴 | Vida = cama. Acordá-lo exige criatividade (dica: sachê). |
| **Marrie** 💅 | Uma lady elegante com um único defeito escandaloso: só faz cocô FORA da caixa. |
| **Mimi** 🔎 | Enorme, branco, olhos azuis. O detetive da casa: fala com o olhar. |
| **Branquinho** 💛 | Amarelo claro (ninguém explica o nome). Inseparável do Mimi. Lambe a Ana de amor. |
| **Tiqueno** ⚡ | Aleijado das patas da frente e o mais sapeca de todos. Só come sachê. |
| **Tiquena** 🧠 | Não anda, se arrasta — e vai aonde quer. A mais sabidinha: sempre tem a solução. |

E as humanas: **Flávia** ☕ (quarto com Sebastian, Popoia e a Lilica, que ela cuida de perto) e **Ana** 🫖 (dorme esmagada pelo Mimi e lambida pelo Branquinho).

## 🤖 Jogar com um mestre de IA

Prefere uma aventura infinita e improvisada? O arquivo [`PROMPT.md`](PROMPT.md) contém o prompt completo do jogo, pronto para colar em um assistente de IA (como o Claude) que fará o papel de mestre e narrador.

## 📁 Estrutura

- `index.html` — o jogo completo (HTML + CSS + JavaScript, autocontido)
- `PROMPT.md` — o prompt original do jogo, para jogar com um mestre de IA
