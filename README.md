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

Você **controla um dos 11 gatos** e explora a casa toda: garagem, sala, cozinha, os dois quartos, a área de serviço e o quintal.

- **Andar:** setas do teclado ou WASD (no celular: botões de toque ▲▼◀▶)
- **Agir/conversar:** tecla **E**, Espaço ou Enter (no celular: botão 🐾)
- **Missão:** investigue a lixeira derrubada, junte as pistas com a Tiquena, consiga o sachê (o Tiqueno vai reclamar), sobreviva à tempestade, empurre a caixa e resgate a Paçoca!
- Converse com os outros 10 gatos e as humanas pela casa — cada um responde do seu jeito
- Colete os 8 petiscos 🍪 escondidos pelos cômodos

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
| **Sebastião** 😴 | Vida = cama. Acordá-lo exige criatividade (dica: sachê). |
| **Marrie** 💅 | Uma lady elegante com um único defeito escandaloso: só faz cocô FORA da caixa. |
| **Mimi** 🔎 | Enorme, branco, olhos azuis. O detetive da casa: fala com o olhar. |
| **Branquinho** 💛 | Amarelo claro (ninguém explica o nome). Inseparável do Mimi. Lambe a Ana de amor. |
| **Tiqueno** ⚡ | Aleijado das patas da frente e o mais sapeca de todos. Só come sachê. |
| **Tiquena** 🧠 | Não anda, se arrasta — e vai aonde quer. A mais sabidinha: sempre tem a solução. |

E as humanas: **Flávia** ☕ (quarto com Sebastião, Popoia e a Lilica, que ela cuida de perto) e **Ana** 🫖 (dorme esmagada pelo Mimi e lambida pelo Branquinho).

## 🤖 Jogar com um mestre de IA

Prefere uma aventura infinita e improvisada? O arquivo [`PROMPT.md`](PROMPT.md) contém o prompt completo do jogo, pronto para colar em um assistente de IA (como o Claude) que fará o papel de mestre e narrador.

## 📁 Estrutura

- `index.html` — o jogo completo (HTML + CSS + JavaScript, autocontido)
- `PROMPT.md` — o prompt original do jogo, para jogar com um mestre de IA
