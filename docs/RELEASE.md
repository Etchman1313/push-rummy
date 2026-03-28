# Release workflow — GitHub + local Docker

For this repository, **“commit and push”** means the full loop below unless you are only syncing source control (then still run the Docker step when you want the running stack updated).

## Standard sequence

1. **Verify** (recommended before every push):

   ```bash
   npm run typecheck
   npm test
   ```

2. **Commit and push to GitHub:**

   ```bash
   git add -A
   git status   # confirm .env and secrets are not staged
   git commit -m "Your message"
   git push origin main
   ```

3. **Refresh local Docker** (rebuild images and restart containers so the host matches `main`):

   ```bash
   npm run docker:up
   ```

   This runs `docker compose up -d --build` from the repo root. Use `npm run docker:down` to stop the stack.

## Why both steps

- **GitHub** is the source of truth for code and collaboration.
- **Docker Compose** on your machine runs the production-style image; it does not auto-update when you push. Rebuild/restart is required to load new server, client, and shared code into running containers.

## Notes

- Do not commit `.env`; use [.env.example](../.env.example) as a template.
- If Compose fails after a dependency change, try `docker compose build --no-cache` once, then `docker compose up -d`.
