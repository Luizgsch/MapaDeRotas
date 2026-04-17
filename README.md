# Vale — mapa operacional (Ponta da Madeira)

Interface React + Vite + Mapbox para visualização e roteamento sobre a malha portuária.

## Desenvolvimento local

1. Copie `.env.example` para `.env` e preencha o token, ou crie `.env` com:

   `VITE_MAPBOX_ACCESS_TOKEN=pk.seu_token_mapbox`

2. `npm install` e `npm run dev`.

## Build

- **Raiz do site (`/`)** — desenvolvimento e hospedagem na raiz de um domínio:

  `npm run build`

- **Subpasta (GitHub Pages em repositório)** — use o mesmo caminho do repositório, com barras:

  `BASE_PATH=/nome-exato-do-repositorio/ npm run build`

O script pós-build gera `dist/404.html` a partir de `index.html` (comportamento SPA no Pages).

## Deploy pela CLI (`npm run deploy`)

Publica o conteúdo de `dist/` na branch **`gh-pages`** do remoto **`origin`** (pacote [gh-pages](https://github.com/tschaub/gh-pages)). Exige repositório Git com `origin` apontando para o GitHub.

Para o site em **`https://<usuario>.github.io/<repositorio>/`**, o build precisa do mesmo caminho:

```bash
BASE_PATH=/nome-exato-do-repositorio/ npm run deploy
```

(O token Mapbox continua vindo do `.env` como `VITE_MAPBOX_ACCESS_TOKEN`.)

No GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch** → branch **`gh-pages`**, pasta **`/(root)`**.

> Se você usar **somente** GitHub Actions (workflow deste repo), não precisa de `npm run deploy`; use um **ou** o outro como fonte em Pages, não os dois ao mesmo tempo.

## GitHub Pages (GitHub Actions)

1. No GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions** (não “Deploy from a branch”).

2. Opcional: **Settings → Secrets and variables → Actions → New repository secret**  
   Nome: `VITE_MAPBOX_ACCESS_TOKEN`  
   Valor: token público `pk.…` do Mapbox (sem ele o build passa, mas o mapa não carrega tiles).

3. Faça push na branch `main` ou `master` (ou rode o workflow manualmente em **Actions**). O workflow em `.github/workflows/deploy-pages.yml` define `BASE_PATH` como `/<nome-do-repo>/` automaticamente.

4. Após o primeiro deploy, o site fica em `https://<usuario>.github.io/<repositorio>/`.

**Site em usuário/organização** (`usuario.github.io` com repositório raiz): use `BASE_PATH=/` no build (ajuste o workflow se for esse caso).

## Variáveis de ambiente

| Variável | Onde |
|----------|------|
| `VITE_MAPBOX_ACCESS_TOKEN` | `.env` local; secret no GitHub Actions para produção |
| `BASE_PATH` | CI ou linha de comando no build com subpasta (ex.: Pages) |
