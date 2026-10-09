@echo off
rem Reabre a si mesmo em uma janela que NAO fecha sozinha (cmd /k), para dar para ler qualquer erro.
if not "%~1"=="run" (
  start "Rumo a Receita - Sincronizador" cmd /k ""%~f0" run"
  exit /b
)
title Rumo a Receita - Sincronizador Estrategia
cd /d "%~dp0"
echo.
echo  ============================================
echo   Rumo a Receita - Sincronizador Estrategia
echo  ============================================
echo   Pasta: %cd%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [ERRO] Node.js nao encontrado neste computador.
  echo         Instale a versao LTS em https://nodejs.org , feche esta janela e rode de novo.
  echo.
  goto fim
)
for /f "delims=" %%v in ('node -v') do echo  Node.js %%v encontrado.

if not exist package.json (
  echo  [ERRO] Nao achei o arquivo package.json nesta pasta.
  echo         Este arquivo precisa ficar dentro da pasta "sync" do repositorio baixado.
  echo.
  goto fim
)

rem Atualiza o sync.js para a versao mais recente publicada (se houver internet).
where curl >nul 2>nul
if not errorlevel 1 (
  curl -fsSL -o sync.js.novo "https://raw.githubusercontent.com/dynosaisistemas-blip/jogo-code/main/sync/sync.js" >nul 2>nul
  if exist sync.js.novo (
    for %%A in (sync.js.novo) do if %%~zA GTR 1000 ( move /y sync.js.novo sync.js >nul & echo  sync.js atualizado para a versao mais recente. ) else ( del sync.js.novo )
  )
)
echo.

if not exist node_modules (
  echo.
  echo  [1/3] Instalando dependencias - so na primeira vez, pode levar alguns minutos...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo  [ERRO] A instalacao falhou. Veja as mensagens acima.
    goto fim
  )
)

if not exist ".perfil-navegador" (
  echo.
  echo  [2/3] Vai abrir uma janela do navegador no site do Estrategia.
  echo        Faca o LOGIN - pode usar "Entrar com Google" - espere aparecer a lista
  echo        de cursos e FECHE a janela do navegador para continuar.
  echo.
  pause
  call npm run login
)

echo.
echo  [3/3] Baixando o material dos cursos - so o que ainda nao foi baixado...
echo.
call npm run sync

echo.
echo  ------------------------------------------------------------
echo  Terminou. Os arquivos ficam em:  %cd%\material
echo  No site rumoareceitafederal.cloud: Importar / Backup ^> Importar pasta sincronizada.
echo  Se apareceu "Nenhum curso" ou 0 itens, tire uma foto desta janela e envie.
echo  ------------------------------------------------------------

:fim
echo.
echo  (Esta janela fica aberta. Pode fechar quando quiser.)
