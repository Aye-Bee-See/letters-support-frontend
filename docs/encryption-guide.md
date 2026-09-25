# Encryption in the letters.support web client

A guided tour of the end-to-end encryption code: what each file does, how the pieces fit, and why they are built the way they are. It grows as the crypto phase is built; the **Status** section at the end says what exists so far.

**Status of this guide:** covers the crypto core (Step 3) and sign-in (Step 4, in progress). Last updated 25 September 2026.

Sources this code follows, in order of authority:

1. `sqlite-express-api/README.md`: sections "Signing in without sending the password" and "End-to-end mode". This is the contract.
2. `answers-for-web-2026-09-24.md` (project root): the Argon2id test vector, code formats and normalisation.
3. `password-split-proposal-2026-09-19.md`: the reasoning behind the password split.
4. `sqlite-express-api/test/e2e-client.js`: Pax's reference client. It's the best spec for formats, though it uses scrypt where real clients use Argon2id.
5. `encryption-design.md`: the original design and its reasoning.

---

## 1. The idea in one page

**What is protected.** Letter bodies, relay notes and attachments are encrypted in the browser before they're sent. The server stores only ciphertext. A stolen database, a stolen backup, a curious admin or a legal demand for stored data yields nothing readable. The server does see who writes to whom and when (metadata), and it serves the web app's JavaScript, so a tampered web host could serve code that leaks keys. No client-side design fixes that last point for a website.

**Who can read a letter.** Every letter has its own random **content key**. The body is encrypted with that key, and then the content key itself is *sealed* separately to each reader:

- the **writer** (sealed to the writer's public key)
- the **group that prints and mails it** (sealed to the group's public key; every group admin who holds the group key can open it)
- a **group managing the writer**, when the writer is a managed account

Each sealed copy is an **envelope**. Anyone without an envelope sealed to them can't read the letter, and that includes the server.

**Three kinds of keypair:**

| Keypair | Who holds the private key | How it's stored on the server |
| --- | --- | --- |
| Account (writer or group admin) | The person | Wrapped under the password (`wrappedPrivateKey`), and separately under the recovery code (`recoveryWrappedPrivateKey`) |
| Group | Every group admin handed it | Sealed to each holder's public key (`orgKey.wrappedOrgPrivateKey` in their bundle) |
| Managed writer (not yet claimed) | The managing group | Sealed to the group (`orgWrappedPrivateKey`); also wrapped under a claim token for handover |

**The password split.** The private key is locked with a key derived from the password. If the password went to the server at sign-in, a tampered server could record it and unlock the key. So the password never leaves the device. One slow Argon2id run produces a *master* key, and two independent keys are derived from it:

```
password ──NFKC, UTF-8──▶ Argon2id(salt, params) ──▶ master (32 bytes; wiped at once)
                                                        ├─ crypto_kdf id 1 "abcwrap_" ─▶ wrapKey: unlocks the private key; never leaves the device
                                                        └─ crypto_kdf id 2 "abcauth_" ─▶ authKey: sent as the "password"
```

The server stores a bcrypt hash of `authKey`, as it used to store a hash of the password. It can't get from `authKey` to `wrapKey`.

---

## 2. Where the code is

```
src/crypto/            the crypto core: no API calls, no React, no state
  index.ts             the only import point for the rest of the app
  sodium.ts            loads libsodium (lazily), base64, wiping
  kdf.ts               Argon2id, the password split, code normalisation
  primitives.ts        keypairs, sealed boxes, XChaCha20-Poly1305, wrapped keys
  codes.ts             recovery codes and claim tokens
  account.ts           account flows: new keys, sign-in unlock, recovery, claim, group keys
  letters.ts           letters: content keys, envelopes, attachments
  crypto.test.ts       cross-client test vectors and round trips (npm test)
src/auth/              flows that join the API calls and the crypto
  signIn.ts            sign-in
  join.ts              joining with an invite code: account and keys in one request
src/context/
  AuthContext.tsx      holds the session and unlocked keys, in memory only
src/pages/auth/
  Login.tsx            the sign-in form
  Join.tsx             joining: code, form, recovery code
src/api/auth.ts        API calls: sign-in parameters, sign-in, key bundle, setting keys, split password
scripts/
  dev-split-accounts.ts  DEVELOPMENT ONLY: moves local seeded accounts to split sign-in
```

Rule: **nothing outside `src/crypto/` touches libsodium**, and nothing outside it imports its files except through `index.ts`.

Rule for screens: **no crypto words in the everyday workflow; full precision where the system is explained.** Workflow screens (sign-in, writing, the inbox, group settings, approvals) say "access", "approve", "sign in" and "recovery code". For example, a group admin who hasn't been handed the group key "is waiting for access to your group's letters", and the owner "approves" them. Public explanation pages (About, and any "how your letters are protected" page) describe keys, what the server stores and who can read what, exactly. Details are in CLAUDE.md, under "No crypto words in everyday screens".

---

## 3. The crypto core, file by file

### `sodium.ts`: loading libsodium

- **`getSodium()`** imports `libsodium-wrappers-sumo` the first time any crypto function runs, and waits for it to initialise. It's a dynamic `import()`, so Vite puts libsodium in a separate file and the public directory pages never download it. The *sumo* build is required because it's the one that includes Argon2id (`crypto_pwhash`).
- **`toBase64` / `fromBase64`** use the `ORIGINAL` variant: standard alphabet, with padding. That's the only encoding the API uses. libsodium's default is URL-safe without padding, so always use these helpers.
- **`wipe(...)`** overwrites byte arrays with zeros (`memzero`) once a key is no longer needed. It's used for every master key, wrap key and derived key.

### `kdf.ts`: turning secrets into keys

- **`KDF_PARAMS`** is `{"kdf":"argon2id","alg":2,"opslimit":2,"memlimit":67108864}`, agreed with the API and Android on 22 September. `alg: 2` is libsodium's id for Argon2id 1.3, and 67108864 bytes is 64 MiB. New keys are always made with these settings.
- **`passwordBytes(password)`** normalises the password to Unicode NFKC, then encodes it as UTF-8. Without NFKC, "café" typed on a Mac (é as one character) and on another keyboard (e plus a combining accent) would be different passwords. Android found that bug.
- **`normalizeCode(code)`** applies the API's rule for typed codes: upper case, letters and digits only, `O`→`0`, `I`/`L`→`1`. "abcd-efgh", "ABCD EFGH" and "ABCDEFGH" are all the same code.
- **`deriveKey(secret, salt, params)`** is Argon2id. It reads the parameters from the stored record rather than assuming them, so if costs are raised later, old keys still open. Anything that isn't Argon2id, or a salt that isn't 16 bytes, is refused rather than guessed at.
- **`splitFromMaster(master)`** derives `wrapKey` (id 1, `"abcwrap_"`) and `authKey` (id 2, `"abcauth_"`, returned as base64). **`deriveSplitKeys(password, salt, params)`** runs the whole password path and wipes the master key.
- **`deriveCodeKey(code, salt, params)`** handles recovery codes and claim tokens. The code is normalised, then run through Argon2id, and **the result locks the private key directly**. There's no split here, because a code is never sent to the server, so there's no auth key to separate.

### `primitives.ts`: the building blocks

| Function | Primitive | Used for |
| --- | --- | --- |
| `generateKeypair()` | X25519 (`crypto_box_keypair`) | Account, group and managed-writer keys |
| `generateContentKey()` | 32 random bytes | One per letter |
| `encrypt` / `decrypt` / `decryptText` | XChaCha20-Poly1305 (`crypto_aead_xchacha20poly1305_ietf`), no associated data, random 24-byte nonce | Bodies, relay notes, files, wrapped keys |
| `sealTo` / `openSealed` | Sealed box (`crypto_box_seal`) | Envelopes, group keys handed to members |
| `wrapPrivateKey` / `unwrapPrivateKey` | XChaCha20-Poly1305 | Locking a private key under a derived key |
| `publicKeyOf` | `crypto_scalarmult_base` | Checking that an unlocked private key matches the account |
| `sha256Hex` | SHA-256 | Claim-token hashes |

Details that matter for compatibility with the API and Android:

- **XChaCha20-Poly1305, not `crypto_secretbox`.** Secretbox is a different cipher (XSalsa20), and its output wouldn't decrypt on the other clients.
- **A wrapped private key is a JSON string**, `{"ciphertext": "…", "nonce": "…"}`, both base64. That's the format the API stores and Pax's reference client produces.
- **Decryption failures throw.** XChaCha20-Poly1305 is authenticated: a wrong key, or ciphertext altered by even one bit, fails loudly rather than producing garbage. The tests check this.

### `codes.ts`: recovery codes and claim tokens

- **`generateCode()`** produces 24 characters of Crockford base32 (`0-9 A-Z` without `I L O U`), which is 120 bits. Each random byte is taken mod 32; since 256 is a multiple of 32, that's unbiased.
- **`formatCode()`** groups a code in fours for display: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. The grouping is only cosmetic, since every use normalises first.
- **`hashCode()`** is SHA-256 hex of the normalised code. For a claim token, that hash is all the server ever sees.
- The recovery-code shape is Pax's suggestion. It's waiting on Android and iOS to agree, and changing it is one constant.

### `account.ts`: the account flows

Each function returns exactly the fields the API expects. Callers add usernames, pen names and so on.

- **`passwordKeys(privateKey, password)`**: new salt, split, wrap. Returns `authKey` (send as `password`) and `{wrappedPrivateKey, kdfSalt, kdfParams}`. Used by new accounts and password changes.
- **`recoveryKeys(privateKey)`**: a new recovery code, its salt, and the private key wrapped under it. **The code is shown once.** The person has to confirm they saved it, because losing both the password and the code means losing the letters for good.
- **`createAccountKeys(password)`**: a keypair plus both of the above. Used for joining, claiming, and first-time key set-up.
- **`signInKeys(password, loginParams)`**: split accounts only; it refuses if the scheme is `plain`. The web client never sends a password (section 4).
- **`unlockAccount(bundle, wrapKey)`**: opens `wrappedPrivateKey`, checks that the private key actually matches the account's public key, and wipes `wrapKey`.
- **`unlockWithRecoveryCode` / `openChallenge`**: recovery. The API seals a one-time challenge to the account's public key; only someone who opened the private key with the code can answer it.
- **`createClaimToken` / `unlockWithClaimToken`**: handing a managed writer their account. **The group's browser makes the token**; the server gets only the hash and the token-wrapped key.
- **`unlockGroupKey` / `sealPrivateKeyTo`**: a group's private key travels sealed to each holder's public key.

### `letters.ts`: letters

- **`encryptLetter(text, readers, relayNote?)`**: a new content key encrypts the body and the note, and the key is sealed to each reader. It returns the `POST /messaging/message` fields plus the content key, which is also used to encrypt attachments.
- **Group envelopes carry `keyVersion`.** Groups can rotate their keypair. A sealed box doesn't say who it was sealed to, so the client states which version of the group key it used, and the API refuses a stale version with `409 KeyVersionError`. The fix is to fetch the group's public key again, re-seal and retry.
- **`openEnvelope` / `decryptLetter`** reverse the process. **`envelopeFor`** seals an existing content key to one more reader, for example when forwarding to a partner group.
- **`encryptFile` / `decryptFile`**: attachments use the letter's content key and their own nonce.

### `crypto.test.ts`: the guard rails

Run with `npm test`. Two kinds of test:

1. **Cross-client vectors**, pinned byte for byte:
   - Argon2id: `correct horse battery staple` with the salt `00…0f` must give the master, `wrapKey` and `authKey` values published in the API README.
   - The split: a master key of bytes `00…1f` must give the published `wrapKey` and `authKey`.
   - NFKC: both spellings of "café" must give the same key.

   **If a change breaks one of these, the change is wrong, not the test.** An account made in the browser has to open on Android, and the reverse.
2. **Round trips**: every flow forwards and back, plus the failure cases: wrong password, wrong recovery code, an outsider's key, altered ciphertext, and plain accounts refused by `signInKeys`.

---

## 4. Signing in

### `src/auth/signIn.ts`

`signIn(username, password)` is the whole sign-in, apart from the form:

1. **`GET /auth/login-params?username=`** returns `{scheme, kdfSalt, kdfParams}`. For a username that doesn't exist, the API returns a stable fake salt, so this call can't be used to find out who has an account.
2. **If the scheme is `plain`, sign-in stops and nothing is sent.** The web client has no plain path at all (the owner's decision, 25 September). The old sign-in sends the password itself, and a tampered server could answer `plain` just to get it. Since the client never sends a password, whatever a server answers, the question of which accounts are plain doesn't arise, and there's nothing to remember per device.
3. **If `split`:** `signInKeys` runs Argon2id once and derives both keys. Only `authKey` is sent, with **`POST /auth/login`**, which returns the user and a token. A `401` is reported as "Incorrect username or password"; the API never says which was wrong. A `429` reports how long to wait.
4. **`GET /auth/keys`** returns the key bundle, using the new token directly because the session doesn't exist yet. If the account has keys, `unlockAccount` opens the private key with `wrapKey`. For a group admin who holds the group key, `unlockGroupKey` opens that too.
5. `wrapKey` is wiped whatever happens (a `finally` block).

### Moving an account to split, and `scripts/dev-split-accounts.ts`

The API accepts a split password only together with the private key re-wrapped under it, in the same `PUT /auth/user` request, even in server mode. So an account without keys can't become split directly: it first gets keys (`setKeys`, `PUT /auth/keys`), then changes its password to split with the same wrapped key (`setSplitPassword`). Both calls are in `src/api/auth.ts`.

The seeded accounts on a fresh local database are `plain`, so the web client can't sign in as them. `npm run dev:split-accounts` moves `admin`, `user1`, `user2` and `testgroup` to split, keeping their passwords. For each one it:
1. signs in the old way once, from the script
2. runs `createAccountKeys(password)`
3. sends `setKeys`, then `setSplitPassword`
4. prints the new recovery code

It's the only code in the repository that sends a real password, and it refuses to run unless the API is on localhost. It's built with `vite build --ssr`, so it runs the real `src/` code under Node.

### `AuthContext`: keeping keys in memory

`startSession(signedIn)` stores the user, the token, the key bundle (still wrapped), and the **unlocked keypairs** in React state. They're never written to `localStorage` or `sessionStorage`. A page refresh signs you out, and that's accepted for v1. `endSession()` drops everything.

JavaScript strings can't be overwritten, so an unlocked private key held as a base64 string lingers in memory until garbage collection. Byte arrays (master keys, wrap keys) *are* wiped. Holding private keys as bytes would be a possible later hardening.

### `Login.tsx`

A form around `signIn`, using the prototype's markup. A plain account gets an explanation instead of a sign-in. While it works, it shows "Signing in…": Argon2id at 64 MiB takes a moment, a second or two on slower phones. The footer offers "I have an invite code" and "I have a claim code", since public registration is closed.

---

## 5. Joining with an invite code

A newcomer's account and keys are made together, on their device, in one request. There's no separate "set up your keys" step, because an account that can sign in always already has keys (decided 25 September).

### `src/auth/join.ts`

`join({code, username, penName, password})`:

1. **`createAccountKeys(password)`** generates a keypair, locks the private key under the password (split scheme: one Argon2id run gives the wrap key and the auth key) and, separately, under a new random recovery code (a second Argon2id run with its own salt).
2. **`POST /auth/join`** sends the code, username, pen name, `authScheme: "split"`, the auth key as `password`, and the key fields: the public key and both locked copies. Only locked copies leave the device. The API makes the account and spends the code in one transaction, so a refusal (a taken username or pen name) leaves the code unspent.
3. **`POST /auth/login`** signs straight in with the auth key it already has. The password isn't run through Argon2id a second time, and the keypair is already in memory, so nothing needs unlocking.
4. It returns the session to start, and the recovery code to show.

### `src/pages/auth/Join.tsx`

There's no prototype, so the markup reuses `claim.html`'s classes and journey:

- **Code:** from the link (`/join?code=…`, the QR code on a slip) or typed. `GET /auth/join` says which group is vouching, or why the code can't be used (never issued, used, expired, cancelled, or the group isn't active).
- **Form:** username, pen name (checked with `GET /auth/pen-name-available` when the field loses focus, nudging towards two parts), password (10 characters minimum, with the prototype's strength meter, `src/utils/password.ts`) and a confirmation. The form shows its own "Setting up your account…" state, so a refusal returns to the form with what was typed.
- **Recovery code:** shown once, with a Copy button and the decided recovery wording, and they can't continue until they tick "I have saved my recovery code". Only then does the session start (`startSession`) and they reach the inbox.

The wording follows the everyday-screen rule: "Your password never leaves this device. Only you, and the group that prints and mails your letters, can read them", with a link to the explanation.

---

## 6. Status

| Piece | State |
| --- | --- |
| Crypto core (`src/crypto/`) | Built and tested (Step 3) |
| Sign-in: split only (plain refused), unlocking keys | Built (Step 4) |
| Dev script moving local seeded accounts to split | Built |
| Join with an invite code: keys made with the account, recovery code confirmed | Built (Step 4) |
| Claim, Recovery pages; safety net for an account without keys at sign-in | Step 4, next |
| Group key creation and approving access (group-owner admin) | Step 6 |
| Encrypting and reading letters in the UI | Step 5 |
| Group keys: hand-over, rotation, managed writers, claim tokens | Step 6 |

## 7. Known limits

- **The web app runs whatever JavaScript the server sends.** A tampered web host could serve code that leaks keys. The native apps are stronger on this point. Nothing here claims otherwise.
- **An account the server holds as `plain` can't sign in to the web client at all.** That's the price of never sending a password. On a real deployment, every account is created split (`REQUIRE_SPLIT_AUTH=true`); how the first admin is created split is an open question for the API side (`questions-for-pax.md` E).
- **Metadata isn't encrypted:** who writes to whom, when and how much.
