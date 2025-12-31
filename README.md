# NovaDEX

Production-ready NovaDEX codebase for Ethernova (chainId 77777).

## Structure
- `dex-ui/` – Swap & pools UI (Ethernova-only)
- `dex-info/` – Analytics UI served at `/info`
- `scripts/` – Smoke tests and diagnostics
- `caddy/` – Caddyfile used in production
- `PRODUCTION_HANDOFF.md` – Runbook and ops notes

## Quick Start (local build)
```bash
cd dex-ui && yarn install && yarn build
cd ../dex-info && yarn install && yarn build
```

## Production URLs
- Swap UI: https://dex.ethnova.net
- Analytics: https://dex.ethnova.net/info
- Subgraph: https://dex.ethnova.net/info/subgraphs/name/novadex/novadex

## Notes
- No Infura or external mainnet defaults.
- Hash router for /info to avoid deep-link 404s.
