# NovaDEX Production Handoff (READY)

## URLs / Endpoints
- Swap UI: https://dex.ethnova.net/
- Analytics: https://dex.ethnova.net/info
- Analytics deep links (hash router):
  - https://dex.ethnova.net/info/#/home
  - https://dex.ethnova.net/info/#/pair/0xcbcbfc021644d4e819ebf2de40b0caf4dcb9e5d1
- Subgraph (V2): https://dex.ethnova.net/subgraphs/name/novadex/novadex
- GraphQL friendly: https://dex.ethnova.net/graphql
- Blocks subgraph: https://dex.ethnova.net/subgraphs/name/novadex/blocks

## Contracts (Ethernova, chainId 77777)
- WNOVA: `0x0f6547E149FBc1d6E515BA15199CB6848ca43517`
- Multicall2: `0x1e43D57fB3E86f81AC8C20b396Ab939FbEB3a545`
- Factory: `0x80d81D354557A5acDda0a2e3f6c2D563b9Ca4E15`
- Router02: `0xa295E35c8384C74588a9608743FB69a7e2cF64da`
- NovaRouter (swap + treasury fee): `0x5473551e02954EF90B5F3c2201dBdE5bb0691612`
- FeeCollector (fee-exempt): `0x8aE053d3E8DC5a53Aaa19379FB865f7cc6A30D21`
- TokenFactory: `0xfAE9CEaDc547fE115af1DfE6A73f6f0386a878AA`
- Treasury (fee recipient): `0x3a38560b66205bB6a31Decbcb245450B2f15d4fD`
- TONY: `0x0840F3c4f2A2D4C43AfB8Ec2d8d14d18CD8d3955`
- Pair (TONY/WNOVA): `0xcbcBFC021644d4e819eBF2dE40B0CAF4Dcb9E5d1`
- startBlock (factory): `70636`
- Deployments JSON: `/opt/novadex/contracts/deployments.json`

## Real Swap (Manual UX Test)
1) Add custom network in MetaMask:
   - Network name: Ethernova
   - RPC: https://rpc.ethnova.net
   - Chain ID: 77777
   - Symbol: NOVA
   - Explorer: https://explorer.ethnova.net
2) Import tokens:
   - TONY: `0x0840F3c4f2A2D4C43AfB8Ec2d8d14d18CD8d3955`
   - WNOVA: `0x0f6547E149FBc1d6E515BA15199CB6848ca43517`
3) Go to https://dex.ethnova.net, connect wallet.
4) Swap a small amount (e.g. 0.01 NOVA -> TONY) and confirm.
5) Verify the tx in explorer: https://explorer.ethnova.net

## Create Pool / Add Liquidity (TONY/WNOVA)
1) Ensure you have WNOVA (use Wrap/Unwrap on the Swap page).
2) Go to https://dex.ethnova.net/#/add/ (or click “Create pool” from Import Pool).
3) Select tokens: TONY + WNOVA.
4) Enter amounts and approve both tokens.
5) Click “Supply” to create the pool or add liquidity.
6) After confirmation, the pool should appear under Pool and swaps should quote.
- MAX on tokens respects pool ratio and your other token balance (Uniswap-style).

## Treasury Fee (1% in WNOVA)
- Swaps use **NovaRouter** and include a 1% protocol fee paid in WNOVA to the treasury.
- Liquidity actions (add/remove) use **Router02** and do **not** pay the treasury fee.
- If a user swaps directly against the Pair contract, the treasury fee is not applied (router-only).
- UI shows “Treasury Fee (1%)” in the swap details and adjusts min-out accordingly.

## Create Token (Launchpad MVP)
- Route: `https://dex.ethnova.net/#/create`
- Deploys an ERC-20 token via TokenFactory.
- Optional: create a WNOVA pair + add initial liquidity in one flow.
- Outputs token address, pair address, and explorer links; includes “Add to MetaMask”.

## Import Pool States
- If factory.getPair returns zero: UI shows “Pool not found” with CTA “Create pool (add liquidity)”.
- If pair exists with zero reserves: UI shows “No liquidity yet” with CTA “Add liquidity”.
- If RPC is unstable: UI shows “Pool lookup failed (RPC unstable)” with a Retry button.

## Add Liquidity Troubleshooting
- If the CTA is stuck on “Enter an amount” with values filled, open `?debug=1` and verify:
  - token decimals show 18 for WNOVA/TONY
  - pair lookup status is not `error`
- If RPC is unstable, a warning banner appears with a Retry button; Approve/Supply remains available once both amounts are set.
- Native NOVA is not used directly for pools; wrap to WNOVA first.
- MAX for NOVA uses native balance minus a gas buffer; if RPC fails it shows “Balance unavailable (RPC)” instead of 0.

## UI Notes (Ethernova-only)
- Chain-locked to 77777; wrong network shows “Switch to Ethernova” (wallet_switchEthereumChain + add chain).
- Default token list is local-only (WNOVA + TONY); no remote lists enabled by default.
- Labels use NOVA/WNOVA and links use the Ethernova explorer.
- Swaps route through **NovaRouter** (treasury fee), liquidity uses **Router02**.
- Dark mode enforced (no light mode toggle).
- Runtime config is generated from deployments at build time:
  - `/opt/novadex/dex-ui/public/ethernova.config.json`
  - Source: `/opt/novadex/contracts/deployments.json`
- RPC fallback: UI uses multiple RPCs for read-only calls and retries if the primary returns HTML/503.
  - Env: `REACT_APP_ETHERNOVA_RPC_URLS` (comma-separated, injected at build time via `ETHERNOVA_RPC_URLS`)
- Multicall soft-fails on 77777 (tryAggregate); direct eth_call fallback is used for pair/reserve reads.
- Explore page (`/#/explore`) lists pools directly from factory (no subgraph dependency).
- My Positions on Explore uses on-chain LP balance with fallback; no false “no liquidity yet.”
- “View pool information” links to internal analytics:
  - `https://dex.ethnova.net/info/#/pair/<pairAddress>` (no Uniswap links).

## /info (Analytics) Routing
- `/info` uses a HashRouter to avoid deep-link 404s.
- Legacy paths like `/info/pair/...` are redirected to `/info/#/pair/...` by Caddy.
- Charts: candlesticks + volume + 24h change; timeframe selector (5m / 1h / 1d).
- Uses subgraph when available and falls back to on-chain swaps/reserves when not.

## Cache Policy (Anti-stale Bundles)
- HTML is served with `Cache-Control: no-cache, no-store, must-revalidate` to force fresh `index.html`.
- Static assets (`/static/*` and `/info/static/*`) are served with long-lived immutable cache.
- If a user reports a stale UI:
  1) Hard refresh (Ctrl+Shift+R)
  2) Clear site data for `dex.ethnova.net`
  3) Reload the page

## Connect Wallet / Switch Network
1) Click “Connect to a wallet” and choose MetaMask or WalletConnect.
2) If you connect while on another chain (e.g. Ethereum Mainnet), the UI will show “Wrong Network”.
3) Click “Switch to Ethernova” to run `wallet_switchEthereumChain` (or add the network if missing).
4) After switching, the modal closes and balances load from the wallet provider.
   - ChainId (hex): `0x12fd1`
   - ChainId (decimal): `77777`

## Debug Mode
- Append `?debug=1` to the URL to show a debug overlay (provider detection, account, chainId raw/number, connector, last activation error).
- Example: `https://dex.ethnova.net/?debug=1`
- Debug overlay also shows the injected supported chain IDs and the network default chainId.
- MAX debug events:
  - `MAX_CLICK` and `MAX_BALANCE_STATE` are emitted on MAX use (see debug overlay last action).

## Wrap / Unwrap (NOVA <-> WNOVA)
1) Open https://dex.ethnova.net
2) Click “Wrap / Unwrap” on the Swap page.
3) Use the Wrap tab to deposit NOVA -> WNOVA.
4) Use the Unwrap tab to withdraw WNOVA -> NOVA.
5) Note: WNOVA is WETH9-style. There is no mint; only `deposit()`/`withdraw()`.

## Wrap Test (CLI, dry-run)
- Script: `/opt/novadex/dex-ui/scripts/wrap_test.ts`
- Run (dry-run): `cd /opt/novadex/dex-ui && npx --yes ts-node --compiler-options '{"module":"CommonJS"}' scripts/wrap_test.ts`
- Optional send: add `--send` to submit a 0.01 NOVA wrap (requires `DEPLOYER_PRIVATE_KEY` in `/opt/novadex/.env`).

## Balance Diagnostics
- Script: `/opt/novadex/scripts/check_balances.sh 0xYourAddress`
- Outputs NOVA / WNOVA / TONY balances (RPC retries + full error output on failure).
- RPC diagnostics: `/opt/novadex/scripts/rpc_diag.sh <rpc_url> <address>`
  - Detects HTML 503 and retries with backoff.

## RPC 503 / HTML Troubleshooting
- Symptom: JSON-RPC calls return HTML (nginx 503) or intermittent 5xx.
- Detection: run `/opt/novadex/scripts/rpc_diag.sh https://rpc.ethnova.net 0xYourAddress`
  - The script prints HTTP status/content-type and flags HTML responses.
- Mitigation: UI uses fallback RPCs and retries for read-only calls; avoid treating RPC errors as zero balance.
- To add backup RPCs, set `ETHERNOVA_RPC_URLS` in `/opt/novadex/.env` (comma-separated) and rebuild.
- Root cause is on the RPC host (nginx/upstream); fix there if persistent.
 - UI no longer uses Infura/mainnet fallbacks; read RPC should always be `rpc.ethnova.net` (see debug overlay).
## UI Smoke Test
- Script: `/opt/novadex/scripts/ui_smoke.sh`
- Checks `/`, `/tokenlists/ethernova.tokenlist.json`, `/info/` and a NOVA keyword sanity check.
- Asset checks: verifies `static/js` files for swap and `/info/static/js` files for analytics.
 - Known acceptable warning: `NOVA keyword not found` (string check only; safe to ignore).

## Info Smoke Test
- Script: `/opt/novadex/scripts/ui_info_smoke.sh`
- Verifies `/info/` assets, then queries GraphQL `_meta`.
- If subgraph is offline, validates on-chain fallback via `pair.getReserves()`.

## Pool Smoke Test
- Script: `/opt/novadex/scripts/ui_pool_smoke.sh`
- Calls factory.getPair(TONY, WNOVA) and getReserves via JSON-RPC.

## LP Quote Smoke Test
- Script: `/opt/novadex/scripts/ui_lp_smoke.sh`
- Verifies pair exists, reserves are non-zero, and prints a 1 WNOVA quote (for sanity).

## Pairs Smoke Test
- Script: `/opt/novadex/scripts/ui_pairs_smoke.sh`
- Checks UI bundle, attempts allPairsLength; if it reverts, falls back to PairCreated logs to fetch the first pair.

## Import Pool Smoke Test
- Script: `/opt/novadex/scripts/ui_import_pool_smoke.sh <wallet>`
- Checks factory.getPair(TONY, WNOVA), LP balanceOf(wallet), token0/token1, and reserves.

## Positions Smoke Test
- Script: `/opt/novadex/scripts/ui_positions_smoke.sh <wallet> [pair]`
- Reads LP balance + totalSupply + reserves for a pair and prints underlying amounts.

## Trade Quote Smoke Test
- Script: `/opt/novadex/scripts/ui_trade_smoke.sh`
- Reads pair/reserves directly and prints a 1 WNOVA quote.
- Optional strict check: set `EXPECTED_TONY_PER_WNOVA` to enable ±2% validation.

## Add Liquidity Read Smoke Test
- Script: `/opt/novadex/scripts/ui_addliq_read_smoke.sh 0xYourAddress`
- Reads WNOVA/TONY allowances against the router and reports UNKNOWN vs value.

## UI Click Smoke Test (Token Selector)
- Script: `/opt/novadex/scripts/ui_click_smoke.mjs`
- Script: `/opt/novadex/scripts/smoke_metrics_sanity.mjs`
- Uses Playwright to open swap, click “Select a token”, attempt Pool -> Add Liquidity token selection, and loads both Add Liquidity routes (TONY/WNOVA and WNOVA/TONY) to ensure no crash screen appears.
- Also checks Import Pool does not stay stuck on “Checking position.”
- Logs and screenshots in: `/opt/novadex/scripts/out/`
- Designed to detect white-screen or chunk-load errors; RPC 403s are logged as warnings.

## MAX Native Smoke Test
- Script: `/opt/novadex/scripts/ui_max_native_smoke.mjs`
- Uses a headless injected provider to verify MAX for NOVA sets a positive amount and leaves a gas buffer.
- Override address/RPC via env: `TEST_ADDRESS` and `RPC_URL`.

## MAX Token Smoke Test
- Script: `/opt/novadex/scripts/ui_max_token_smoke.mjs`
- Uses Playwright to set TONY/WNOVA and validates MAX fills Swap and Add Liquidity inputs.
- Fails if MAX is disabled, input stays empty, or a crash screen appears.

## UI Crash Protection
- Global ErrorBoundary shows a fallback screen with build stamp and a “Reload” button.
- ChunkLoadError auto-reloads once with a cache-busting query.
- Runtime errors are captured and shown in debug mode (`?debug=1`).

## Subgraph Health (/info)
- Health check:
  - `curl -fsS https://dex.ethnova.net/subgraphs/name/novadex/novadex -H 'content-type: application/json' --data '{"query":"{_meta{block{number}}}"}'`
- `/info` shows a fallback banner if the subgraph is offline/syncing, plus an on-chain spot price.
- Script: `/opt/novadex/scripts/ui_subgraph_smoke.sh`

## Wallet Connection Troubleshooting
- ChainId (decimal): `77777`
- ChainId (hex): `0x12fd1`
- RPC: https://rpc.ethnova.net
- Explorer: https://explorer.ethnova.net
- Optional backups: set `ETHERNOVA_RPC_URLS` in `/opt/novadex/.env` and rebuild to enable additional RPCs.
- If you see “Unsupported chain id”, open `?debug=1` and verify:
  - Injected supports: `77777` (not enforced; UI handles wrong network)
  - Network default: `77777`
  - Then click “Switch to Ethernova” to add/switch network.

## On-chain Smoke Test (Read-only)
- Run: `cd /opt/novadex/contracts && npx hardhat run scripts/smoke_read.ts --network ethernova --no-compile`
- Expected: reserves > 0 and `getAmountsOut` returns a non-zero TONY amount.

## Graph / Subgraphs
- Graph node (local): http://127.0.0.1:8000
- V2 subgraph name: `novadex/novadex`
- Blocks subgraph name: `novadex/blocks`
- If subgraph errors on historical calls, the RPC must support archive mode.

## Operations
- Restart everything: `/opt/novadex/scripts/restart_all.sh`
- Graph stack logs: `cd /opt/novadex/graph && docker compose logs -f graph-node`
- Systemd logs (Caddy): `journalctl -u caddy -f`
- Systemd logs (Graph service): `journalctl -u novadex-graph -f`
- Healthcheck: `/opt/novadex/scripts/healthcheck.sh`
- Re-deploy contracts: `/opt/novadex/scripts/deploy_contracts.sh`
- Re-deploy v2 subgraph: `/opt/novadex/scripts/deploy_subgraph.sh`
- Backup: `/opt/novadex/scripts/backup_all.sh`
- Rollback frontends: `/opt/novadex/scripts/rollback_frontends.sh <release_id>`

## Backups / Restore
- Backups stored in `/opt/novadex/backups` (keeps last 7).
- Restore (example):
  1) Stop services: `systemctl stop caddy` and `systemctl stop novadex-graph`
  2) Extract backup: `tar -xzf /opt/novadex/backups/novadex_<timestamp>.tar.gz -C /`
  3) Fix ownership if needed: `chown -R novadex:novadex /opt/novadex`
  4) Start services: `systemctl start novadex-graph` and `systemctl start caddy`

## Frontend Rollback
- Releases live in `/opt/novadex/releases/<timestamp>`.
- Rollback: `/opt/novadex/scripts/rollback_frontends.sh <release_id>`
- Current symlink: `/opt/novadex/current`

## Checklist
- https://dex.ethnova.net/ loads swap UI
- https://dex.ethnova.net/info loads analytics
- https://dex.ethnova.net/subgraphs/name/novadex/novadex returns pairs
- https://dex.ethnova.net/graphql returns pairs
- `systemctl is-active caddy` == active
- `systemctl is-active novadex-graph` == active

## Notes
- RPC/Explorer are hosted on VPS #2: `https://rpc.ethnova.net` and `https://explorer.ethnova.net` (do not modify from this VPS).
- Caddy terminates HTTPS and proxies GraphQL/ subgraphs; ports 8000/8020/8030/8040/5001 are not public.
- RPC 503 can occur intermittently. Scripts use a fixed fallback gas price (`GAS_PRICE_WEI`, default 5 gwei) and retry `eth_getTransactionReceipt`/`eth_getTransactionByHash` with backoff.
- If `graph-node` reports `database unavailable`, ensure `/opt/novadex/graph/postgres` is owned by UID 999 (postgres) and restart the stack.
- UFW allows only 22/80/443; internal services bind to 127.0.0.1.
