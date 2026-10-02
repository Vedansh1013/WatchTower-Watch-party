# Submission checklist

Use this in the final 24 hours before sending the assignment.

- [ ] Push the project to a GitHub repository.
- [ ] Deploy the repository on Render using `render.yaml`.
- [ ] Set `DATABASE_URL` on the Render web service to the PostgreSQL **Internal Database URL**.
- [ ] Replace the placeholder Live URL in `README.md` with the real URL.
- [ ] Create an account, redeploy once, and confirm the same account can still log in.
- [ ] Create or join a room while signed in, open **My history**, and confirm the room is listed after a refresh.
- [ ] Open the live app in two tabs and complete the demo flow in the README.
- [ ] Capture a 60-90 second screen recording: create room, join, sync, request approval, promote moderator, chat.
- [ ] Confirm `/health` returns `{ "ok": true, "database": "connected" }` on the deployed URL.
- [ ] Run `npm test` and `npm run build` once more after deployment.
- [ ] Prepare the walkthrough explanation: server authority, WebSocket room fan-out, RBAC, PostgreSQL user/session/room-history persistence, autoplay trade-off, and in-memory room-scaling trade-off.

Suggested final submission sentence:

> Watchtower is deployed at `<LIVE_URL>`. The README contains the local setup, architecture overview, demo flow, event table, deployment notes, and code walkthrough trade-offs.
