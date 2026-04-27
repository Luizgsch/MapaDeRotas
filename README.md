# Vale — mapa operacional (Ponta da Madeira)

Interface React + Vite + Mapbox para visualização e roteamento sobre a malha portuária.

**Repositório:** [github.com/Luizgsch/MapaDeRotas](https://github.com/Luizgsch/MapaDeRotas)  

## Desenvolvimento local

1. Copie `.env.example` para `.env` e preencha com um token **público** Mapbox (`pk.…`), **nunca** o token secreto (`sk.…`). O `sk.` não pode ir no JavaScript do navegador e o GitHub [bloqueia o push](https://docs.github.com/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/working-with-push-protection-from-the-command-line#resolving-a-blocked-push) se aparecer no bundle.

2. `npm install` e `npm run dev`.

## Build

- **Raiz do site (`/`)** — `npm run build`

- **Este repositório no Pages** — caminho fixo do site:

  `BASE_PATH=/MapaDeRotas/ npm run build`

O script pós-build gera `dist/404.html` a partir de `index.html` (SPA no Pages).

## Deploy pela CLI (`npm run deploy`)

Publica `dist/` na branch **`gh-pages`** do `origin` ([gh-pages](https://github.com/tschaub/gh-pages)). O script já usa **`BASE_PATH=/MapaDeRotas/`** e exige Git com `origin` → `https://github.com/Luizgsch/MapaDeRotas.git`.

```bash
npm run deploy
```

No GitHub: **Settings → Pages → Source: Deploy from a branch** → **`gh-pages`** / **`/(root)`**.

> Se usar **somente** GitHub Actions, não precisa de `npm run deploy`; escolha **uma** fonte em Pages.

## GitHub Pages (GitHub Actions)

1. **Settings → Pages → Source: GitHub Actions**

2. Secret opcional `VITE_MAPBOX_ACCESS_TOKEN` com token **`pk.`** (público).

3. Push em `main` / `master` ou rode o workflow em **Actions**. O `BASE_PATH` vira `/MapaDeRotas/` pelo nome do repositório.

## Variáveis de ambiente

| Variável | Onde |
|----------|------|
| `VITE_MAPBOX_ACCESS_TOKEN` | Só **`pk.`** no `.env` local ou no secret do Actions |
| `BASE_PATH` | CI; local com subpasta; o `npm run deploy` já define para este repo |
