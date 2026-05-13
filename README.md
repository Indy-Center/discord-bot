# discord-bot

Cloudflare Worker that turns Discord forum posts into GitHub issues. Moderators triage feedback threads with `/accept`, `/deny`, `/done`; accepting opens an issue in the repo configured for that forum channel + tag combination, and the thread is updated when the issue is closed on GitHub. Built on Hono, with KV holding the thread ↔ issue mapping.

[![Build and Deploy](https://github.com/Indy-Center/discord-bot/actions/workflows/build-and-deploy.yml/badge.svg)](https://github.com/Indy-Center/discord-bot/actions/workflows/build-and-deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## HTTP surface

- `GET /` — liveness check (`discord-bot ok`).
- `POST /discord` — Discord interaction webhook (slash commands, signed via `DISCORD_PUBLIC_KEY`).
- `POST /github` — GitHub App webhook for issue close events.

## Project layout

- `src/index.ts` — Hono root; mounts `/discord` and `/github`.
- `src/discord.ts` — slash-command handlers (`/accept`, `/deny`, `/done`).
- `src/github.ts` — issue-close webhook handler that updates the originating Discord thread.
- `src/config.ts` — forum-channel-to-repo routing rules. Add new forums and tag filters here.
- `src/commands.ts` — slash command definitions; re-register via `npm run register-commands` after edits.
- `src/crypto.ts` — Discord webhook signature verification.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in Discord + GitHub App creds
npm run dev                      # http://localhost:8787
```

The bot only acts on inbound webhooks, so plain `wrangler dev` isn't reachable from Discord/GitHub. Either:

- `wrangler dev --remote` — runs the Worker on Cloudflare's edge so webhooks reach it.
- Tunnel `localhost:8787` over HTTPS via [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or [ngrok](https://ngrok.com), then point the Discord interaction URL and GitHub App webhook URL at the tunnel.
- Deploy a separate dev Worker (`wrangler deploy`) and test end-to-end against it.

After editing `src/commands.ts`, re-register commands with Discord:

```bash
npm run register-commands
```

When adding a new forum route, dump tag IDs with:

```bash
npm run forum-tags
```

## Tests

```bash
npm test             # vitest
npm run typecheck    # tsc --noEmit
```

## Deployment

Pushing to `main` triggers `.github/workflows/build-and-deploy.yml`. Manual deploys use `npm run deploy`. Production secrets live in Cloudflare — set each one with `wrangler secret put`. The full list is in `.dev.vars.example`.

The KV namespace `KV` (declared in `wrangler.jsonc`) stores the thread ↔ issue mapping. No D1 or other bindings.

## Disclaimer

We are not affiliated with the FAA or any aviation governing body. This software is for flight simulation use on the [VATSIM](https://www.vatsim.net) network.
