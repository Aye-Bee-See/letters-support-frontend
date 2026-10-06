// The end-to-end crypto core. Pages and components import from here only, and
// never touch libsodium directly (CLAUDE.md, "Encryption").

export { KDF_PARAMS, normalizeCode } from './kdf'
export { CODE_LENGTH, formatCode, generateCode, hashCode, INVITE_CODE_LENGTH } from './codes'
export { generateKeypair, type Keypair } from './primitives'
export {
  createAccountKeys,
  createClaimToken,
  firstKeysForSplitAccount,
  lockKeys,
  openChallenge,
  passwordKeys,
  recoveryKeys,
  sealPrivateKeyTo,
  signInKeys,
  unlockAccount,
  unlockGroupKey,
  unlockWithClaimToken,
  unlockWithRecoveryCode,
  type ClaimMaterial,
  type LockedKeys,
  type NewAccount,
  type PasswordKeyFields,
  type RecoveryKeyFields,
} from './account'
export {
  decryptFile,
  decryptLetter,
  encryptFile,
  encryptLetter,
  envelopeFor,
  forgetContentKey,
  openEnvelope,
  reencryptLetter,
  type EncryptedLetter,
  type Reader,
} from './letters'
export { wipe } from './sodium'
