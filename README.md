# Indy Center Discord Bot

[![Build and Deploy](https://github.com/Indy-Center/discord-bot/actions/workflows/build-and-deploy.yml/badge.svg)](https://github.com/Indy-Center/discord-bot/actions/workflows/build-and-deploy.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=white)](https://hono.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A Cloudflare Worker that turns Discord forum posts into GitHub issues. Moderators triage feedback threads with the slash commands `/accept`, `/deny`, and `/done`. Accepting a thread opens an issue in the repository configured for that forum channel and tag combination, and the thread is updated when the issue is closed on GitHub.

The Worker is built on [Hono](https://hono.dev) and runs on [Cloudflare Workers](https://workers.cloudflare.com), with [Cloudflare KV](https://developers.cloudflare.com/kv/) holding the issue to thread mapping. Forum routing rules live in `src/config.ts`.

## Local Development

1. Clone this repository.
2. Run `npm install`.
3. Copy `.dev.vars.example` to `.dev.vars` and fill in the values for your Discord application and GitHub App.
4. Run `npm run dev` to start a local Worker on `http://localhost:8787`.
5. Run `npm test` to execute the Vitest suite.

Local testing is awkward because the bot only does anything in response to webhooks. Both Discord and GitHub need a publicly reachable HTTPS endpoint to deliver events, which `wrangler dev` does not provide on its own. A few options:

- Run `wrangler dev --remote` to execute the Worker on Cloudflare's edge instead of locally.
- Expose `localhost:8787` over HTTPS with a tunnel such as [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or [ngrok](https://ngrok.com), then point the Discord interaction URL and the GitHub App webhook URL at the tunnel.
- Deploy a separate development Worker with `wrangler deploy` and use that for end to end testing.

Slash commands have to be registered with Discord before they appear in the server. After editing `src/commands.ts`, run:

```sh
npm run register-commands
```

There is also a helper for inspecting forum tag IDs when adding new routes:

```sh
npm run forum-tags
```

Both scripts read credentials from `.dev.vars`.

### Deploying

Merges to `main` deploy automatically via the `Build and Deploy` GitHub Actions workflow. `npm run deploy` publishes manually via Wrangler. Production secrets live in Cloudflare, not `.dev.vars`. Set them with `wrangler secret put DISCORD_BOT_TOKEN` and so on for each variable listed above.

## Reach Out

Found a bug or have an idea? Open an issue on this repository. For anything beyond the bot itself, visit [flyindycenter.com](https://flyindycenter.com) or join us on Discord at [discord.indy.center](https://discord.indy.center).

## License

Released under the [MIT License](LICENSE).

## Disclaimer

We are not affiliated with the FAA or any other governing aviation body. All content in this repository, including the software, configuration, and documentation, is intended for use with flight simulation only.

These tools support virtual air traffic control and flying experiences within the [VATSIM](https://www.vatsim.net) network.
