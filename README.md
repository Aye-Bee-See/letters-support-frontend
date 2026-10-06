# letters.support web client

React, TypeScript and Vite. The API it talks to is `sqlite-express-api`; its
README is the contract.

```bash
npm ci
cp .env.example .env     # VITE_API_URL: the API, http://localhost:3069 by default
npm run dev              # also: npm run lint, npm test, npm run build
```

## Signing in as the seeded test accounts

A freshly seeded local API has split-scheme accounts with no keys (`admin`,
`chapter1`, `user1`, …; passwords in the API README, "Credentials"), and the web
client refuses an account without keys. Give them keys, keeping their
passwords, with:

```bash
npm run dev:split-accounts
```

It talks to `VITE_API_URL` (from `.env` or the environment), refuses anything but
localhost, and prints each account's recovery code. Run it again after every
database reset. Accounts that still use the old `plain` sign-in are moved to
split at the same time. The list of accounts is at the top of
`scripts/dev-split-accounts.ts`.
