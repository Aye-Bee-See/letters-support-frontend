# letters.support web client

The website for the letters.support network: a public directory of political
prisoners, the facilities that hold them and the groups that write to them, and
behind a sign-in the tools for writing, printing and mailing letters. It is a
React 19 and TypeScript single-page app built with Vite, talking to the
`sqlite-express-api` over JSON. **The API's README is the contract**: every
field, status and refusal this client handles is defined there, and its
CHANGELOG's "For clients" notes say what each change means for this code.

Letters are encrypted end to end in the browser. The server stores ciphertext
and never holds a password or an unlocked key. How that works, and what it
does and does not protect, is in [docs/encryption-guide.md](docs/encryption-guide.md).

## Contents

- [Who uses it](#who-uses-it)
- [Running it](#running-it)
- [Signing in on a fresh database](#signing-in-on-a-fresh-database)
- [The pages](#the-pages)
- [How the code is laid out](#how-the-code-is-laid-out)
- [Sessions, keys and what a refresh does](#sessions-keys-and-what-a-refresh-does)
- [Working on it](#working-on-it)
- [Troubleshooting](#troubleshooting)
- [Further reading](#further-reading)

## Who uses it

The API has three roles, and the screens use their own words for them:

| API role  | On screen        | What they do here                                                                                                                                                                                      |
| --------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `user`    | writer           | Finds someone to write to, writes letters, reads replies, follows what happened to each letter (queued, printed, mailed, returned, declined).                                                          |
| `chapter` | group admin      | Runs a letter-writing group: prints and mails the queue, records prisoners' replies, looks after writers who have no account of their own, hands out invite codes, holds the group's encryption key. |
| `admin`   | site admin       | Runs the site: approves groups, moderates directory changes, decides block recommendations, reads the audit log, sets site-wide switches. Holds no group key and can read no letter.                 |

Anyone, signed in or not, can read the public directory. A `banned` account
cannot sign in at all.

Within a group there is one **group-owner admin** (the API's `ownerId`), who
hands the group key to the other group admins, can take it back, rotate it,
and pass ownership on. Every holder of the group key can read every letter the
group mails, so the screens that hand it out say so and advise keeping the
group small.

## Running it

You need Node 20.19 or later in the 20 line, or 22.12 or later (Vite's range,
in `package.json` under `engines`; `.nvmrc` names 24, and CI uses the current
LTS), and a running copy of the API. The API's own README covers its install; its development server
listens on `3069` and allows the origin `http://localhost:3001` by default,
which is where this app's dev server runs.

```bash
npm ci
cp .env.example .env      # VITE_API_URL=http://localhost:3069
npm run dev               # http://localhost:3001
```

| Command                      | What it does                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                | Vite's dev server on port 3001 (fixed: the API's CORS default names it), reachable from the LAN as `0.0.0.0`.      |
| `npm run build`              | Type-checks the app, the Node config and the tests (`tsc -b`), then builds `dist/`.                                 |
| `npm run preview`            | Serves `dist/` locally.                                                                                             |
| `npm run lint`               | ESLint over everything.                                                                                             |
| `npm test`                   | Vitest, once. Unit tests live beside the code as `*.test.ts`.                                                       |
| `npm run dev:split-accounts` | Gives a fresh local database's seeded accounts their keys so they can sign in here. See the next section.           |

Settings come from the environment at build time, the Vite way:

| Variable       | Default                 | Meaning                                                                                       |
| -------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `VITE_API_URL` | `http://localhost:3069` | The API's origin. Read in `src/api/client.ts`. A value in the environment beats `.env`.       |

To point a dev server at another API, or run a second copy beside the first:

```bash
VITE_API_URL=http://localhost:3100 npx vite --port 3201
```

(The API copy must then list `http://localhost:3201` in its `CORS_ORIGIN`.)

The public test API at `https://abctest.letters.support` follows the API's
`main` within the hour; a build pointed at it must be served from an origin
that server allows.

## Signing in on a fresh database

This client never sends a password to the server. Sign-in derives two keys from
the password on the device (Argon2id, then a split): one is sent in place of the
password, the other unlocks the account's private key and never leaves the
browser. An account made the old way, whose password the server would receive,
is refused at sign-in with no request sent.

The API's seeded accounts (`admin`, `chapter1`, `user1` to `user40`; passwords
in the API README under "Credentials") use the split scheme but have **no
keys**, and this client refuses an account without keys. Give them keys,
keeping their passwords, with:

```bash
npm run dev:split-accounts
```

It talks to `VITE_API_URL` (from `.env` or the environment), refuses anything
but localhost, keeps each account's existing salt (a new salt would lock the
account out), and prints each account's recovery code. Run it again after
every database reset. The list of accounts is at the top of
`scripts/dev-split-accounts.ts`; add to it if you need more of the `userN`
accounts.

A useful minimum for trying the group side on a fresh database:

1. `chapter1` signs in, lands on `/inbox` behind a notice that the group has no
   key, and sets one up on `/settings/keys`. That makes `chapter1` the
   group-owner admin.
2. `admin` links Test Chapter as the relay group of a published facility on
   `/admin/groups/1/edit`, so letters to prisoners there route to it.
3. `user1` writes a letter to a prisoner at that facility from `/letters/new`.
4. `chapter1` sees it in the queue, prints it, marks it printed and mailed, and
   later records the reply by the reference printed in its footer.

A second group admin, for trying the key hand-out, comes from a `member`
invitation: `admin` creates one on `/admin/invite` (or `chapter1` on
`/settings/invitations`), and the invitee accepts it at `/invitation` in a
private window.

## The pages

Routes are declared in `src/App.tsx`. Links that carry something read it from
the query string, so a code or token can be handed over as a link.

### Public (header and footer)

| Route            | Page                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `/`              | Front page: featured prisoners and the news feed the API pulls.                             |
| `/prisoners`     | The directory, with the filters the API offers, and `/prisoners/:id` for one profile.       |
| `/facilities`    | Facilities and their mail rules; `/facilities/:id` for one.                                 |
| `/groups`        | Groups by country, role and services; `/groups/:id` for one, with who it supports.          |
| `/about`         | What the network is.                                                                       |

The API decides what each visitor sees: the public gets published records,
staff also get pending ones.

### Accounts

| Route              | Page                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`           | One sign-in page for every role. With two-factor on it asks for the code, or a recovery code.                                                              |
| `/forgot-password` | Recovery with the recovery code shown once at sign-up: the same keys, a new password, a new recovery code.                                                 |
| `/join?code=`      | Joining as a writer with an invite code from a group. Keys are made here; the recovery code is shown once and must be confirmed saved.                     |
| `/claim?token=`    | A managed writer taking over the account their group made for them: the group's keypair re-locked under their own password.                               |
| `/invitation?token=` | Accepting an invitation to join a group as a group admin, or to found a new group (which then waits for a site admin's approval).                        |
| `/account/security` | Two-factor sign-in: set up with a QR code, confirm, recovery codes, switch off. When a site admin requires it, every other page sends you here until it is set up. |
| `/account/pen-name` | A writer's pen name, the name letters are signed with. A writer without one is sent here at sign-in.                                                      |

### Writers

| Route               | Page                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/inbox`            | Conversations, newest first, with each letter's state; letters on hold say why.                                                                                        |
| `/threads/:id`      | One conversation. Letters are decrypted in the browser; attachments when a letter is opened. A returned or declined letter has "Write it again". A reply recorded before the writer had keys shows as waiting for the group to share it. |
| `/letters/new`      | Find a prisoner, read the facility's rules, choose the group that will mail it where there is a choice, type the letter or attach a scan, or log a letter written on paper and handed to the group. |

### Group admins

Every group page sits behind a gate: an account in no group, or whose group is
still pending or has been suspended, sees a notice instead of the page (the API
would refuse every write). A group admin who does not hold the group key in
this session sees a banner pointing to the key page. The gate also runs the
group's housekeeping once per session: it gives keys to writers made before
encryption, and adds the writer's envelope to any reply recorded before the
writer had keys.

| Route                    | Page                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/inbox`                 | The group inbox: **To print** (the queue by state: queued, held, printed, mailed, returned, not sent; select several and mark them printed or mailed, or decline them), **Conversations**, **Writers** (the people the group writes for), and recent activity. `?tab=` picks the tab. |
| `/letters/:id/print`     | One letter: its text, the note to the group, attachments, and a print layout with the agreed footer and reply reference. Mark printed or mailed, record that it came back, decline it ("Don't send") with a reason the writer is told, or share it with a partner group. |
| `/replies/new?reply=`    | Record a prisoner's reply: by the reference number on the envelope, or by the writer's pen name when there is none; typed, scanned, or both.                                                                                                                             |
| `/threads/:id`           | The same conversation page writers see, with a record-reply panel instead of a reply panel, and block actions on the writer.                                                                                                                                              |
| `/letters/new?writer=`   | Write as one of the group's managed writers, or anonymously under the group's shared writer.                                                                                                                                                                             |
| `/writers/new`           | Add a managed writer. Their keypair is made here and sealed to the group.                                                                                                                                                                                                |
| `/writers/:id/edit`      | Name, email, note and pen name of an unclaimed writer; delete them.                                                                                                                                                                                                      |
| `/writers/:id/handoff`   | Hand the account to the person: a claim token made in the browser, shown once, with the claim link; revoke it.                                                                                                                                                           |
| `/invite-codes`          | Issue a batch of invite codes for a letter night, print them as slips (with a QR code; slips stay outside prisons), see how many were used, cancel a batch.                                                                                                              |
| `/settings`              | The group's own public record and numbers, the facilities it relays for and the prisoners it supports, its history, and links to the rest.                                                                                                                              |
| `/settings/keys`         | The group key: set it up, see who holds it and who is waiting, hand it out, take it back, pass ownership, rotate it (how a member is really removed).                                                                                                                     |
| `/settings/invitations`  | Invite a new group admin, or vouch for a new group joining the network.                                                                                                                                                                                                  |
| `/blocked-writers`       | Writers the group has stopped mailing for, with unblock; the group's site-wide block recommendations and what the site admins decided.                                                                                                                                   |

### Site admins (`/admin`)

A separate layout with its own stylesheet, loaded only under `/admin`.

| Route                        | Page                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `/admin`                     | Dashboard: what is waiting, backups, and whether every relaying group has a key.                                          |
| `/admin/queue`               | Directory changes proposed by groups, each against the record's current values; approve or reject with a note.             |
| `/admin/bans`                | Groups' recommendations to block a writer site-wide; ban or dismiss, with a note back to the group.                        |
| `/admin/prisoners`, `/admin/facilities`, `/admin/groups` | The directory records, and `…/:id/edit` for each. Groups are approved, suspended and linked to facilities here. |
| `/admin/invite`              | Invite a new group (vouched for by a group, or by nobody) or a member of a group.                                           |
| `/admin/audit`               | The audit log.                                                                                                             |
| `/admin/settings`            | Site-wide switches: who must use two-factor sign-in.                                                                       |

## How the code is laid out

```
src/
  api/          one file per API area; plain functions over an axios client (client.ts),
                each with a comment naming the README section it follows
  auth/         sign-in, join, claim, recovery, accept-invitation flows (crypto + API, no React)
  crypto/       the end-to-end core: libsodium lives here and nowhere else (index.ts is the only import point)
  letters/      sending a letter (send.ts), recording a reply (record.ts), opening one (open.ts)
  groups/       group-admin logic with no React: housekeeping, key hand-out, rotation
  context/      AuthContext: the session, in memory only
  hooks/        useApi (load + reload), useGroup (the admin's group and key state), drafts, list params, leave guard
  components/
    layout/     header, footers, the admin shell, route guards, the group gate
    forms/      shared form parts: account fields, pen name, recovery-code step, upload zone, reply panels
    group/      the group inbox's pieces: queue, letter actions, writers, activity, key notices
    invitations/ the invitation form, token notice and table shared by the admin and group pages
    ui/         small presentational parts
  pages/        one folder per area: public, auth, account, inbox, correspondence, org (group admins), admin
  types/        the API's data model, by hand, from the API's schemas and README tables
  utils/        wording and small pure helpers (held reasons, decline reasons, footer sentence, event wording, reference check digit)
  assets/styles style.css (public and signed-in pages), admin.css (/admin only), inbox.css, pages/*.css
scripts/        dev-split-accounts.ts
docs/           encryption-guide.md
```

Three rules hold the shape together:

- **Pages do not do crypto.** They call `src/auth`, `src/letters` and
  `src/groups`, which call `src/crypto`. Nothing outside `src/crypto` imports
  libsodium.
- **Wording lives in `src/utils`**, keyed on the API's codes (`heldReason`,
  `returnReason`, `declineReason`, feed events, an error's `name` and
  `condition`), never on its English sentences, which the README says are not
  stable.
- **The API's names are kept.** The data types use the API's field names; a
  URL parameter is the query parameter it becomes. The one translation is on
  screen: the API's `chapter` is a "group", its `prison` a "facility", its
  `admin` a "site admin".

## Sessions, keys and what a refresh does

- The session, including the unlocked private key and the group key, lives in
  React state only: never `localStorage` or `sessionStorage`. **A page refresh
  signs you out.** That is deliberate for now; sign in again.
- Tokens last a week and are revoked on sign-out. A `401` anywhere ends the
  session and sends you to `/login`, remembering where you were going.
- A `403` saying two-factor sign-in must be set up first, from any request,
  locks every page but `/account/security` until it is.
- Writes answer `429` when an account exceeds the API's hourly limits; the
  client reads `Retry-After` into the error. Sending a letter uses an
  `Idempotency-Key`, so a retry after a lost answer never mails it twice.
- Codes shown once (invite codes, claim tokens, invitation tokens) are kept on
  screen until you say you have copied them, and leaving the page asks first.
  The browser's Back button is not guarded.
- The browser runs whatever JavaScript the web host serves. A tampered host
  could serve code that leaks keys; the native apps are stronger on that point.
  The server always sees who writes to whom and when. See "Known limits" in
  the encryption guide.

## Working on it

**Branches and reviews.** Work happens on a branch and lands on `master`
through a pull request; CI (`.github/workflows/ci.yml`) runs lint, tests and
build on every pull request and push to `master`. Branch names are short and
say what the branch does (`group-keys`, `decline-rule-label`). Commit messages
say what changed in plain words.

**The API comes first.** Before building against an endpoint, read its README
section and the CHANGELOG entries that mention it; the controllers under the
API's `routes/controllers/` settle anything the README leaves open. When the
code and the README disagree, build to the code and file an issue on the API.
When the API gains a feature, its CHANGELOG entry says what a client should do
under "For clients"; that is the to-do list.

**Errors.** `src/api/client.ts` normalises every failure to one shape:
`status`, `name`, `condition`, `errors[]` (validation sentences), `message`,
and `retryAfter` on a `429`. Word a refusal from `name` plus `condition` (the
stable pair the API's `code` is composed from); show `errors[0]` for a `400`
about a field; never match on `message`.

**Wording rules the pages follow** (from the project's `decisions-made.md`):
say "group admin" and "site admin", never "member"; any screen that hands out
the group key says every holder can read every letter the group mails; notes
to a writer on a returned or declined letter are not encrypted, and the form
says so; no QR code or barcode on anything that goes inside a prison; the
printed footer reads _"Write back to {name}, c/o {group}. Reference
{number}: please write this number at the top of your reply."_

**Styles.** The public and signed-in pages use `style.css` and the per-page
files under `assets/styles/pages/`; the admin area uses `admin.css`, loaded
only under `/admin`, so its class names must not leak into other pages.
Components shared by both (the invitation parts) take a class set rather than
assuming one.

**Fonts.** Nothing is loaded from a third party, fonts included: a visitor's
browser talks only to this site and the API. The logo's face, Protest
Guerrilla, used to come from Google Fonts on every page and no longer does;
`.site-logo` still names it first and falls back to Arial Black. To
self-host it (it is under the SIL Open Font License), put a `woff2` under
`public/fonts/` and add an `@font-face` for it at the top of `style.css`,
with `font-display: swap`.

**Tests.** Vitest in Node, with no DOM: tests cover the crypto core (including
cross-client vectors), the sending and recording flows, rotation, housekeeping,
and the pure wording helpers. Component behaviour is checked by hand against a
local API; see the walk-through above. Add a `*.test.ts` beside any new pure
module.

**Dependencies.** React, react-router, axios, `libsodium-wrappers-sumo` (the
sumo build, for Argon2id) and `qrcode-generator`. Adding one is a decision,
not a convenience.

## Troubleshooting

- **"This account isn't fully set up, so it can't be used yet."** The account
  has no keys. On a local database, run `npm run dev:split-accounts`. On the
  test server, the account was made before keys existed; it needs recovery or
  a new account.
- **Signed out on refresh.** Expected; the session is memory-only.
- **Every request fails from the browser but curl works.** CORS: the API's
  `CORS_ORIGIN` must list this app's origin exactly (`http://localhost:3001` by
  default).
- **"Your group has no group key yet."** Someone in the group sets it up on
  `/settings/keys`; a site admin cannot. Until then nothing can be sealed to the
  group, so no letter can be sent through it.
- **A letter shows "waiting to be shared with you".** The writer had no keys
  when the reply was recorded. It opens after a group admin next signs in here
  or in an app; nothing to do on the writer's side.
- **A group admin sees "This letter could not be opened" after a rotation.**
  They were left out of the new key, or their session still holds the old one.
  The keys page and the inbox pick up a new key; otherwise sign in again. When
  the letter's envelope names another group key version than the session's,
  the page says so instead: "sealed under an older group key" (the current
  key can't open it), or "a newer group key" than the session holds.

## Further reading

- The API's `README.md` (the contract) and `CHANGELOG.md` ("For clients").
- [docs/encryption-guide.md](docs/encryption-guide.md): the end-to-end design as
  built here, file by file, with its status table and known limits.
- The project's `decisions-made.md` and `decisions-to-make.md` in the working
  folder: why things are the way they are, and what is still open.
- Bugs and gaps go to this repository's GitHub issues.
