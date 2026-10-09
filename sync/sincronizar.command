#!/bin/bash
cd "$(dirname "$0")"
echo "============================================"
echo " Rumo à Receita — Sincronizador Estratégia"
echo "============================================"
if ! command -v node >/dev/null 2>&1; then
  echo "[!] Node.js não encontrado. Instale a versão LTS em https://nodejs.org e rode de novo."
  read -p "Pressione Enter para sair"; exit 1
fi
[ -d node_modules ] || { echo "[1/3] Instalando (só na primeira vez)..."; npm install || exit 1; }
if [ ! -d .perfil-navegador ]; then
  echo; echo "[2/3] Vai abrir o navegador no site do Estratégia. Faça o LOGIN, espere a lista de cursos e FECHE a janela."
  read -p "Pressione Enter para continuar"; npm run login
fi
echo; echo "[3/3] Baixando o material..."; npm run sync
echo; echo "Pronto. Pasta: $(pwd)/material — importe-a no site em 'Importar / Backup'."
read -p "Pressione Enter para sair"
