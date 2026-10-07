# Tablefoundry Settlement Ledger

Two paired dashboards (Next.js):

- `/tf` – TF Owner dashboard. Enter test cases here. Shows a 6-character pairing code.
- `/restaurant` – Restaurant dashboard (read-only). Enter the pairing code to see the same data live.

The dashboards talk directly to each other (WebRTC). The free public PeerJS broker is only used to introduce them; no server of your own is needed and nothing is stored on a server.

## Run locally
    npm install
    npm run dev        # http://localhost:3000

## Host it (Vercel, free)
1. Push this folder to a GitHub repo (set the project's root directory to `tablefoundry-ledger` if it is inside a larger repo).
2. vercel.com → Add New → Project → import the repo → Deploy. No settings or environment variables needed.
3. Send the tester the URL. Tester opens `/tf` on one device and `/restaurant` on another.
   The "Copy restaurant link" button on the TF page produces a link with the code already filled in.

Or from the terminal: `npx vercel --prod`.
