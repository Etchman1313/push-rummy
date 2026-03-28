# Push Rummy — documentation index

Use this folder as the canonical reference for design, operations, and how to play.

| Document | Audience | Contents |
|----------|----------|----------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Developers / DevOps | System design, modules, APIs, state machine, deployment, scaling |
| [GAMEPLAY.md](GAMEPLAY.md) | Players & designers | End-to-end product flow: accounts, lobby, table, AI, scoring, ratings |
| [RULES.md](RULES.md) | Players & implementers | Canonical card rules, objectives, melds, scoring — matches `@push-rummy/shared` |
| [SECURITY.md](SECURITY.md) | Operators | Auth, CORS, TLS, admin, rate limits |
| [PERFORMANCE.md](PERFORMANCE.md) | Operators | Leaderboard cost, AI bounds, scaling caveats |
| [RELEASE.md](RELEASE.md) | Maintainers | Commit + push to GitHub and rebuild local Docker |

The root [README.md](../README.md) covers quick start, Docker, environment variables, and links the release workflow.
