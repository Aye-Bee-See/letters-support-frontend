import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { formatCode, generateCode, hashCode } from './codes'
import { deriveKey, KDF_PARAMS, normalizeCode, passwordBytes, splitFromMaster } from './kdf'
import {
  createAccountKeys,
  createClaimToken,
  firstKeysForSplitAccount,
  lockKeys,
  openChallenge,
  passwordKeys,
  resealTo,
  sealPrivateKeyTo,
  signInKeys,
  unlockAccount,
  unlockGroupKey,
  unlockWithClaimToken,
  unlockWithRecoveryCode,
} from './account'
import { decryptFile, decryptLetter, encryptFile, encryptLetter, envelopeFor, openEnvelope } from './letters'
import { generateKeypair, sealTo } from './primitives'
import { fromBase64, getSodium, toBase64 } from './sodium'

// Argon2id at 64 MiB takes a fraction of a second per run; flows run it several times.
const SLOW = 30_000

const bytes = (n: number) => new Uint8Array(n).map((_, i) => i)

describe('cross-client test vectors (must match the API and Android byte for byte)', () => {
  // password-split-proposal-2026-09-19.md §3, and sqlite-express-api test/auth-split.test.js
  it('splits a master key into the agreed wrap and auth keys', async () => {
    const master = bytes(32)
    expect(await toBase64(master)).toBe('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=')
    const { wrapKey, authKey } = await splitFromMaster(master)
    expect(await toBase64(wrapKey)).toBe('NFKvOp5duAjQ7QmoxriVlK2aftNJI7xkGi/wooDCMcI=')
    expect(authKey).toBe('wjrINHoPKZiRPnOiURiE/mvNm6+UZXEkNDE/lgfPOWo=')
  })

  // answers-for-web-2026-09-24.md §5, and the API README "Signing in without sending the password"
  it('derives the agreed Argon2id master, wrap and auth keys from a password', { timeout: SLOW }, async () => {
    const salt = await toBase64(bytes(16))
    expect(salt).toBe('AAECAwQFBgcICQoLDA0ODw==')
    const master = await deriveKey(passwordBytes('correct horse battery staple'), salt, KDF_PARAMS)
    expect(await toBase64(master)).toBe('wFzkxN1+DkXuYBHMWdBoreR98bAfwM+c1GeL32ilt7A=')
    const { wrapKey, authKey } = await splitFromMaster(master)
    expect(await toBase64(wrapKey)).toBe('tOggbVRmxTeDlXjvpt6YS1UxcYLSb8DRaDfpFMXoEv8=')
    expect(authKey).toBe('OY25VECyUEJUDcyPZSqK4R+oG5BvSzBlQNOrdiwgkR4=')
  })

  it('normalises passwords to NFKC before hashing', { timeout: SLOW }, async () => {
    const salt = await toBase64(bytes(16))
    const expected = 'lEpmh4tmC0xaD5DhMboQo/3Hw7JqT3VThdqq0n1pImc='
    expect(await toBase64(await deriveKey(passwordBytes('café'), salt, KDF_PARAMS))).toBe(expected)
    expect(await toBase64(await deriveKey(passwordBytes('café'), salt, KDF_PARAMS))).toBe(expected)
  })

  it('writes the agreed kdfParams', () => {
    expect(KDF_PARAMS).toEqual({ kdf: 'argon2id', alg: 2, opslimit: 2, memlimit: 67108864 })
  })

  it('refuses any key derivation other than Argon2id', async () => {
    await expect(deriveKey(passwordBytes('x'), await toBase64(bytes(16)), { kdf: 'scrypt' })).rejects.toThrow(/Unsupported/)
  })
})

describe('typed codes', () => {
  it('normalises like the API: upper case, letters and digits only, O→0, I/L→1', () => {
    expect(normalizeCode('abcd-efgh ijkl.mnop')).toBe('ABCDEFGH1JK1MN0P')
    expect(normalizeCode('0O1IL')).toBe('00111')
  })

  it('generates 24-character Crockford base32 codes and formats them in fours', async () => {
    const code = await generateCode()
    expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{24}$/)
    expect(formatCode(code)).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/)
    expect(normalizeCode(formatCode(code))).toBe(code)
  })

  it('hashes the normalised code with SHA-256, as the server does', async () => {
    const expected = createHash('sha256').update('ABCD1234').digest('hex')
    expect(await hashCode('abcd-1234')).toBe(expected)
    expect(await hashCode('ABCD 1234')).toBe(expected)
  })
})

describe('account flows', () => {
  it('creates an account that signs in and unlocks with the same password', { timeout: SLOW }, async () => {
    const account = await createAccountKeys('a long enough password')
    expect(account.authKey).toMatch(/^[A-Za-z0-9+/]{43}=$/)

    // What sign-in does with GET /auth/login-params.
    const params = { scheme: 'split' as const, kdfSalt: account.keyFields.kdfSalt, kdfParams: account.keyFields.kdfParams }
    const signIn = await signInKeys('a long enough password', params)
    expect(signIn.authKey).toBe(account.authKey)
    const unlocked = await unlockAccount(account.keyFields, signIn.wrapKey)
    expect(unlocked).toEqual(account.keypair)
  })

  it('does not unlock with the wrong password', { timeout: SLOW }, async () => {
    const account = await createAccountKeys('the right password')
    const params = { scheme: 'split' as const, kdfSalt: account.keyFields.kdfSalt, kdfParams: account.keyFields.kdfParams }
    const wrong = await signInKeys('the wrong password', params)
    expect(wrong.authKey).not.toBe(account.authKey)
    await expect(unlockAccount(account.keyFields, wrong.wrapKey)).rejects.toThrow()
  })

  it('never derives keys for a plain account', async () => {
    await expect(signInKeys('pw', { scheme: 'plain', kdfSalt: '', kdfParams: KDF_PARAMS })).rejects.toThrow(/split/)
  })

  it('recovers with the recovery code however it is typed', { timeout: SLOW }, async () => {
    const account = await createAccountKeys('a long enough password')
    expect(account.recoveryCode).toMatch(/^([0-9A-Z]{4}-){5}[0-9A-Z]{4}$/)
    const typed = account.recoveryCode.toLowerCase().replace(/-/g, ' ')
    const recovered = await unlockWithRecoveryCode({ ...account.keyFields }, typed)
    expect(recovered).toEqual(account.keypair)
    await expect(unlockWithRecoveryCode({ ...account.keyFields }, 'WRONG-CODE')).rejects.toThrow()
  })

  it('opens the recovery challenge sealed to the account', async () => {
    const keypair = await generateKeypair()
    const challenge = (await getSodium()).randombytes_buf(32)
    const answer = await openChallenge(await sealTo(keypair.publicKey, challenge), keypair)
    expect(answer).toBe(await toBase64(challenge))
  })

  it('gives a keyless split account keys under its existing salt, so the same password still signs in', { timeout: SLOW }, async () => {
    // A seeded account: split, with a salt and no keys (API #181: the salt must not change).
    const kdfSalt = await toBase64(bytes(16))
    const params = { scheme: 'split' as const, kdfSalt, kdfParams: { ...KDF_PARAMS } }
    const before = await signInKeys('a long enough password', params)
    const first = await firstKeysForSplitAccount(before.wrapKey, params)
    expect(first.keyFields.kdfSalt).toBe(kdfSalt)
    expect(first.keyFields.kdfParams).toEqual(KDF_PARAMS)

    const next = await signInKeys('a long enough password', params)
    expect(next.authKey).toBe(before.authKey)
    expect(await unlockAccount(first.keyFields, next.wrapKey)).toEqual(first.keypair)
    expect(await unlockWithRecoveryCode({ ...first.keyFields }, first.recoveryCode)).toEqual(first.keypair)
  })

  it('re-wraps a private key under a new password (password change)', { timeout: SLOW }, async () => {
    const keypair = await generateKeypair()
    const changed = await passwordKeys(keypair.privateKey, 'a brand new password')
    const params = { scheme: 'split' as const, kdfSalt: changed.fields.kdfSalt, kdfParams: changed.fields.kdfParams }
    const signIn = await signInKeys('a brand new password', params)
    expect(signIn.authKey).toBe(changed.authKey)
    expect(await unlockAccount({ ...changed.fields, publicKey: keypair.publicKey }, signIn.wrapKey)).toEqual(keypair)
  })

  it('hands a managed writer their key through a claim token, then locks it under their password', { timeout: SLOW }, async () => {
    const writer = await generateKeypair()
    const claim = await createClaimToken(writer.privateKey)
    expect(claim.fields.tokenHash).toBe(await hashCode(claim.token))
    const opened = await unlockWithClaimToken({ ...claim.fields, publicKey: writer.publicKey }, claim.token.replace(/-/g, ''))
    expect(opened).toEqual(writer)

    // Claiming: the same keypair, locked under the writer's own password and recovery code.
    const locked = await lockKeys(opened.privateKey, 'the writer password')
    const signIn = await signInKeys('the writer password', { scheme: 'split', kdfSalt: locked.keyFields.kdfSalt, kdfParams: locked.keyFields.kdfParams })
    expect(signIn.authKey).toBe(locked.authKey)
    expect(await unlockAccount({ ...locked.keyFields, publicKey: writer.publicKey }, signIn.wrapKey)).toEqual(writer)
    expect(await unlockWithRecoveryCode({ ...locked.keyFields, publicKey: writer.publicKey }, locked.recoveryCode)).toEqual(writer)
  })

  it('opens a group key sealed to a member', async () => {
    const group = await generateKeypair()
    const member = await generateKeypair()
    const wrappedOrgPrivateKey = await sealPrivateKeyTo(group.privateKey, member.publicKey)
    expect(await unlockGroupKey({ wrappedOrgPrivateKey, chapterPublicKey: group.publicKey }, member)).toEqual(group)
    const outsider = await generateKeypair()
    await expect(unlockGroupKey({ wrappedOrgPrivateKey, chapterPublicKey: group.publicKey }, outsider)).rejects.toThrow()
  })

  it('re-seals what was sealed to an old group key to a new one, and only the new one opens it', async () => {
    const oldGroup = await generateKeypair()
    const newGroup = await generateKeypair()
    const secret = bytes(32)
    const sealed = await sealTo(oldGroup.publicKey, secret)
    const resealed = await resealTo(sealed, oldGroup, newGroup.publicKey)
    expect(await openEnvelope({ wrappedKey: resealed }, newGroup)).toEqual(secret)
    await expect(openEnvelope({ wrappedKey: resealed }, oldGroup)).rejects.toThrow()
    // Something not sealed to the old key is refused rather than passed on.
    await expect(resealTo(sealed, newGroup, oldGroup.publicKey)).rejects.toThrow()
  })
})

describe('letters', () => {
  it('encrypts for each reader; each opens it; group envelopes carry the key version', async () => {
    const writer = await generateKeypair()
    const group = await generateKeypair()
    const { contentKey, fields } = await encryptLetter(
      'Dear friend, thinking of you.',
      [
        { readerType: 'user', readerId: 7, publicKey: writer.publicKey },
        { readerType: 'chapter', readerId: 3, publicKey: group.publicKey, keyVersion: 2 },
      ],
      'Two pages, include the photo',
    )
    expect(fields.envelopes).toHaveLength(2)
    expect(fields.envelopes[0]).not.toHaveProperty('keyVersion')
    expect(fields.envelopes[1]).toMatchObject({ readerType: 'chapter', readerId: 3, keyVersion: 2 })

    for (const [envelope, keypair] of [
      [fields.envelopes[0], writer],
      [fields.envelopes[1], group],
    ] as const) {
      const key = await openEnvelope(envelope, keypair)
      expect(key).toEqual(contentKey)
      expect(await decryptLetter(fields, key)).toEqual({
        text: 'Dear friend, thinking of you.',
        relayNote: 'Two pages, include the photo',
      })
    }
    const outsider = await generateKeypair()
    await expect(openEnvelope(fields.envelopes[0], outsider)).rejects.toThrow()
  })

  it('forwards to one more reader with the same content key', async () => {
    const partner = await generateKeypair()
    const { contentKey, fields } = await encryptLetter('hello', [{ readerType: 'user', readerId: 1, publicKey: (await generateKeypair()).publicKey }])
    const extra = await envelopeFor(contentKey, { readerType: 'chapter', readerId: 9, publicKey: partner.publicKey, keyVersion: 1 })
    expect((await decryptLetter(fields, await openEnvelope(extra, partner))).text).toBe('hello')
  })

  it('refuses altered ciphertext', async () => {
    const reader = await generateKeypair()
    const { contentKey, fields } = await encryptLetter('original', [{ readerType: 'user', readerId: 1, publicKey: reader.publicKey }])
    const raw = await fromBase64(fields.ciphertext)
    raw[0] ^= 1
    await expect(decryptLetter({ ...fields, ciphertext: await toBase64(raw) }, contentKey)).rejects.toThrow()
  })

  it('encrypts and decrypts attachments with the letter key', async () => {
    const reader = await generateKeypair()
    const { contentKey } = await encryptLetter('with a scan', [{ readerType: 'user', readerId: 1, publicKey: reader.publicKey }])
    const file = new Uint8Array(1000).map((_, i) => i % 251)
    const sealed = await encryptFile(file, contentKey)
    expect(sealed.bytes).not.toEqual(file)
    expect(await decryptFile(sealed.bytes, sealed.nonce, contentKey)).toEqual(file)
  })
})
