@echo off
chcp 65001 >nul
title Rumo à Receita — Sincronizador Estratégia
cd /d "%~dp0"
echo.
echo  ============================================
echo   Rumo a Receita - Sincronizador Estrategia
echo  ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo  [!] Node.js nao encontrado.
  echo      Baixe e instale a versao LTS em: https://nodejs.org
  echo      Depois rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo  [1/3] Instalando (so na primeira vez, pode levar alguns minutos)...
  call npm install
  if errorlevel 1 ( echo  [!] Falha na instalacao. & pause & exit /b 1 )
)
if not exist ".perfil-navegador" (
  echo.
  echo  [2/3] Vai abrir uma janela do navegador no site do Estrategia.
  echo        Faca o LOGIN com seu e-mail e senha, espere aparecer a lista de cursos
  echo        e FECHE a janela para continuar.
  echo.
  pause
  call npm run login
)
echo.
echo  [3/3] Baixando o material dos cursos (so o que ainda nao foi baixado)...
echo.
call npm run sync
echo.
echo  Pronto. Os arquivos estao na pasta:  %~dp0material
echo  No site (rumoareceitafederal.cloud) va em "Importar / Backup" e escolha essa pasta.
echo.
echo  Se nao encontrou cursos, rode:  npm run inspecionar   e me envie o que aparecer.
echo.
pause
