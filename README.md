# Tablefoundry Settlement Ledger

Next.js app with paired dashboards (login required).

- `/tf` – **TF Owner · Operations** (production-style screen): wallets, refund requests, owes lists, refund & transfer-reversal modals.
- `/tf/simulator` – **Order simulator**: create fake orders (restaurant, delivery partner uEngage / Pro Routing, amounts, outcome, reason, issue note).
- `/restaurant` – Restaurant dashboard (read-only). Enter the 6-character pairing code shown on the TF screens; pick a restaurant from the selector.

TF and restaurant dashboards talk directly (WebRTC via the free public PeerJS broker). All data is kept in the TF browser (localStorage). No backend, no real Razorpay calls: refund and reversal IDs are simulated (`rfnd_SIM…`, `rvrs_SIM…`) unless pasted in manually.

## Run locally
    npm install
    npm run dev

## Login
Set `AUTH_USERS` and `AUTH_SECRET` (see `scripts/hash-password.mjs`) in `.env.local` locally and in Vercel project settings.
