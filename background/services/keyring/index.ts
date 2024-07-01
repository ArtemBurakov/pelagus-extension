import {
  AddressLike,
  getBytes,
  Mnemonic,
  QuaiHDWallet,
  SigningKey,
  Wallet,
  Zone,
} from "quais"
import { QuaiTransactionRequest } from "quais/lib/commonjs/providers"
import { SerializedHDWallet } from "quais/lib/commonjs/wallet/hdwallet"

import {
  decryptVault,
  deriveSymmetricKeyFromPassword,
  encryptVault,
  SaltedKey,
} from "./encryption"
import BaseService from "../base"
import { getEncryptedVaults, writeLatestEncryptedVault } from "./storage"

import {
  Events,
  InternalSignerWithType,
  Keyring,
  KeyringAccountSigner,
  PrivateKey,
  SerializedPrivateKey,
  SerializedVaultData,
  SignerImportMetadata,
  SignerImportSource,
  SignerSourceTypes,
} from "./types"
import { MINUTE } from "../../constants"
import { ServiceCreatorFunction } from "../types"
import { EIP712TypedData, HexString, KeyringTypes, UNIXTime } from "../../types"

import logger from "../../lib/logger"
import { generateRandomBytes, isPrivateKey } from "./utils"
import { normalizeEVMAddress, sameEVMAddress } from "../../lib/utils"

const QUAI_HD_WALLET_ACCOUNT_INDEX = 0

export const MAX_KEYRING_IDLE_TIME = 60 * MINUTE
export const MAX_OUTSIDE_IDLE_TIME = 60 * MINUTE

/*
 * KeyringService is responsible for all key material, as well as applying the
 * material to sign messages, sign transactions, and derive child keypair.
 *
 * The service can be in two states, locked or unlocked, and starts up locked.
 * Keyrings are persisted in encrypted form when the service is locked.
 *
 * When unlocked, the service automatically locks itself after it has not seen
 * activity for a certain amount of time. The service can be notified of
 * outside activity that should be considered for the purposes of keeping the
 * service unlocked. No keyring activity for 30 minutes causes the service to
 * lock, while no outside activity for 30 minutes has the same effect.
 */
export default class KeyringService extends BaseService<Events> {
  #cachedKey: SaltedKey | null = null

  private wallets: Wallet[] = []

  private quaiHDWallets: QuaiHDWallet[] = []

  #keyringMetadata: { [keyringId: string]: { source: SignerImportSource } } = {}

  #hiddenAccounts: { [address: HexString]: boolean } = {}

  /**
   * The last time a keyring took an action that required the service to be
   * unlocked (signing, adding a keyring, etc.)
   */
  lastKeyringActivity: UNIXTime | undefined

  /**
   * The last time the keyring was notified of an activity outside the
   * keyring. {@see markOutsideActivity}
   */
  lastOutsideActivity: UNIXTime | undefined

  static create: ServiceCreatorFunction<Events, KeyringService, []> =
    async () => {
      return new this()
    }

  private constructor() {
    super({
      autolock: {
        schedule: {
          periodInMinutes: 1,
        },
        handler: () => {
          this.autolockIfNeeded()
        },
      },
    })
  }

  override async internalStartService(): Promise<void> {
    // Emit locked status on startup. Should always be locked, but the main
    // goal is to have external viewers synced to internal state no matter what
    // it is. Don't emit if there are no quaiHDWallets to unlock.
    await super.internalStartService()
    if ((await getEncryptedVaults()).vaults.length > 0) {
      this.emitter.emit("locked", this.locked())
    }
  }

  override async internalStopService(): Promise<void> {
    await this.lock()
    await super.internalStopService()
  }

  /**
   * @return True if the keyring is locked, false if it is unlocked.
   */
  locked(): boolean {
    return this.#cachedKey === null
  }

  /**
   * Update activity timestamps and emit unlocked event.
   */
  #unlock(): void {
    this.lastKeyringActivity = Date.now()
    this.lastOutsideActivity = Date.now()
    this.emitter.emit("locked", false)
  }

  /**
   * Unlock the keyring with a provided password, initializing from the most
   * recently persisted keyring vault if one exists.
   *
   * @param password A user-chosen string used to encrypt keyring vaults.
   *        Unlocking will fail if an existing vault is found, and this password
   *        can't decrypt it.
   *
   *        Note that losing this password means losing access to any key
   *        material stored in a vault.
   * @param ignoreExistingVaults If true, ignore any existing, previously
   *        persisted vaults on unlock, instead starting with a clean slate.
   *        This option makes sense if a user has lost their password, and needs
   *        to generate a new keyring.
   *
   *        Note that old vaults aren't deleted, and can still be recovered
   *        later in an emergency.
   * @returns true if the service was successfully unlocked using the password,
   *          and false otherwise.
   */
  async unlock(
    password: string,
    ignoreExistingVaults = false
  ): Promise<boolean> {
    if (!this.locked()) {
      logger.warn("KeyringService is already unlocked!")
      this.#unlock()
      return true
    }

    if (!ignoreExistingVaults) {
      await this.loadKeyrings(password)
    }

    // if there's no vault, or we want to force a new vault, generate a new key and unlock
    if (!this.#cachedKey) {
      this.#cachedKey = await deriveSymmetricKeyFromPassword(password)
      await this.persistKeyrings()
    }

    this.#unlock()
    return true
  }

  /**
   * Lock the keyring service, deleting references to the cached vault
   * encryption key and quaiHDWallets.
   */
  async lock(): Promise<void> {
    this.lastKeyringActivity = undefined
    this.lastOutsideActivity = undefined
    this.#cachedKey = null
    this.quaiHDWallets = []
    this.#keyringMetadata = {}
    this.wallets = []
    this.emitter.emit("locked", true)
    this.emitKeyrings()
  }

  /**
   * Notifies the keyring that an outside activity occurred. Outside activities
   * are used to delay auto locking.
   */
  markOutsideActivity(): void {
    if (typeof this.lastOutsideActivity !== "undefined") {
      this.lastOutsideActivity = Date.now()
    }
  }

  // Locks the keyring if the time since last keyring or outside activity exceeds preset levels.
  private async autolockIfNeeded(): Promise<void> {
    if (
      typeof this.lastKeyringActivity === "undefined" ||
      typeof this.lastOutsideActivity === "undefined"
    ) {
      // Normally both activity counters should be undefined only if the keyring
      // is locked, otherwise they should both be set; regardless, fail-safe if
      // either is undefined and the keyring is unlocked.
      if (!this.locked()) {
        await this.lock()
      }

      return
    }

    const now = Date.now()
    const timeSinceLastKeyringActivity = now - this.lastKeyringActivity
    const timeSinceLastOutsideActivity = now - this.lastOutsideActivity

    if (
      timeSinceLastKeyringActivity >= MAX_KEYRING_IDLE_TIME ||
      timeSinceLastOutsideActivity >= MAX_OUTSIDE_IDLE_TIME
    ) {
      await this.lock()
    }
  }

  // Throw if the keyring is not unlocked; if it is, update the last keyring activity timestamp.
  private requireUnlocked(): void {
    if (this.locked()) {
      throw new Error("KeyringService must be unlocked.")
    }

    this.lastKeyringActivity = Date.now()
    this.markOutsideActivity()
  }

  /**
   * Generate a new keyring
   *
   * @param type - the type of keyring to generate. Currently only supports 256-
   *        bit HD keys.
   * @returns An object containing the string ID of the new keyring and the
   *          mnemonic for the new keyring. Note that the mnemonic can only be
   *          accessed at generation time through this return value.
   */
  async generateNewKeyring(
    type: KeyringTypes,
    path?: string
  ): Promise<{ id: string; mnemonic: string[] }> {
    this.requireUnlocked()

    if (type !== KeyringTypes.mnemonicBIP39S256) {
      throw new Error(
        "KeyringService only supports generating 256-bit HD key trees"
      )
    }

    const randomBytes = generateRandomBytes(24)
    const { phrase } = Mnemonic.fromEntropy(randomBytes)

    const keyringToVerifyId = this.quaiHDWallets.length.toString()

    return { id: keyringToVerifyId, mnemonic: phrase.split(" ") }
  }

  /**
   * Import new internal signer
   *
   * @param signerMetadata any signer with type and metadata
   * @returns null | string - if new account was added or existing account was found then returns an address
   */
  async importKeyring(
    signerMetadata: SignerImportMetadata
  ): Promise<HexString | null> {
    this.requireUnlocked()

    try {
      let address: HexString | null

      if (signerMetadata.type === SignerSourceTypes.privateKey) {
        address = this.#importPrivateKey(signerMetadata.privateKey)
      } else {
        const { mnemonic, source, path } = signerMetadata // TODO-MIGRATION
        address = this.#importKeyring(mnemonic, source)
      }

      if (!address) {
        throw new Error("address is null")
      }

      this.#hiddenAccounts[address] = false
      await this.persistKeyrings()
      this.emitter.emit("address", address)
      this.emitKeyrings()

      return address
    } catch (error) {
      logger.error("Signer import failed:", error)
      return null
    }
  }

  /**
   * Import keyring and pull the first address from that
   * keyring for system use.
   *
   * @param mnemonic - a seed phrase
   * @param source
   * @returns The string ID of the new keyring.
   */
  #importKeyring(mnemonic: string, source: SignerImportSource): string {
    const quaiMnemonic = Mnemonic.fromPhrase(mnemonic)
    const newQuaiHDWallet = QuaiHDWallet.fromMnemonic(quaiMnemonic)

    const existingQuaiHDWallet = this.quaiHDWallets.find(
      (quaiHDWallet) => quaiHDWallet.xPub === newQuaiHDWallet.xPub
    )
    if (existingQuaiHDWallet) {
      const { address } = existingQuaiHDWallet.getAddressesForAccount(
        QUAI_HD_WALLET_ACCOUNT_INDEX
      )[0]
      return address
    }

    this.quaiHDWallets.push(newQuaiHDWallet)

    const { address } = newQuaiHDWallet.getNextAddress(
      QUAI_HD_WALLET_ACCOUNT_INDEX,
      Zone.Cyprus1
    )
    // If address was previously imported as a private key then remove it
    if (this.#findPrivateKey(address)) {
      this.#removePrivateKey(address)
    }

    this.#keyringMetadata[newQuaiHDWallet.xPub] = { source }

    return address
  }

  /**
   * Import private key with a string
   * @param privateKey - string
   * @returns string - address of imported or existing account
   */
  #importPrivateKey(privateKey: string): string {
    const newWallet = new Wallet(privateKey)
    const normalizedAddress = normalizeEVMAddress(newWallet.address)

    if (this.#findSigner(normalizedAddress)) return normalizedAddress

    this.wallets.push(newWallet)
    this.#keyringMetadata[normalizedAddress] = {
      source: SignerImportSource.import,
    }
    return normalizedAddress
  }

  /**
   * Find a signer object associated with a given account address
   */
  #findSigner(account: AddressLike): InternalSignerWithType | null {
    const keyring = this.#findKeyringNew(account)
    if (keyring)
      return {
        signer: keyring,
        type: SignerSourceTypes.keyring,
      }

    const privateKey = this.#findPrivateKey(account)
    if (privateKey)
      return {
        signer: privateKey,
        type: SignerSourceTypes.privateKey,
      }

    return null
  }

  async exportPrivKey(address: string): Promise<string> {
    this.requireUnlocked()

    const signerWithType = this.#findSigner(address)
    if (!signerWithType) {
      logger.error(`Export private key for address ${address} failed`)
      return ""
    }

    if (isPrivateKey(signerWithType)) {
      return signerWithType.signer.privateKey
    }

    const privateKey = signerWithType.signer.getPrivateKey(address)
    return privateKey ?? "Not found"
  }

  /**
   * Return the source of a given address' keyring if it exists. If an
   * address does not have a keyring associated with it - returns null.
   */
  async getKeyringSourceForAddress(
    address: string
  ): Promise<"import" | "internal" | null> {
    try {
      const keyring = await this.#findKeyring(address)
      return this.#keyringMetadata[keyring.xPub].source
    } catch (e) {
      // Address is not associated with a keyring
      return null
    }
  }

  /**
   * Return an array of keyring representations that can safely be stored and
   * used outside the extension.
   */
  getKeyrings(): Keyring[] {
    this.requireUnlocked()

    return this.quaiHDWallets.map((kr) => ({
      type: KeyringTypes.mnemonicBIP39S256,
      addresses: [
        ...kr
          .getAddressesForAccount(QUAI_HD_WALLET_ACCOUNT_INDEX)
          .filter((address) => !this.#hiddenAccounts[address.address])
          .map((address) => address.address),
      ],
      id: kr.xPub,
      path: null, // TODO-MIGRATION
    }))
  }

  /**
   * Returns and array of private keys representations that can safely be stored
   * and used outside the extension
   */
  getPrivateKeys(): PrivateKey[] {
    this.requireUnlocked()

    return this.wallets.map((wallet) => ({
      type: KeyringTypes.singleSECP,
      addresses: [wallet.address],
      id: wallet.signingKey.publicKey,
      path: null,
    }))
  }

  /**
   * Derive and return the next address for a KeyringAccountSigner representing
   * an HDKeyring.
   *
   * @param keyringAccountSigner - A KeyringAccountSigner representing the
   *        given keyring.
   */
  async deriveAddress({
    keyringID,
    zone,
  }: KeyringAccountSigner): Promise<HexString> {
    this.requireUnlocked()

    const quaiHDWallet = this.quaiHDWallets.find((kr) => kr.xPub === keyringID)
    if (!quaiHDWallet) {
      throw new Error("QuaiHDWallet not found.")
    }

    const { address } = quaiHDWallet.getNextAddress(
      QUAI_HD_WALLET_ACCOUNT_INDEX,
      zone
    )

    await this.persistKeyrings()
    await this.emitter.emit("address", address)
    this.emitKeyrings()

    return address
  }

  async hideAccount(address: HexString): Promise<void> {
    this.#hiddenAccounts[address] = true
    const keyring = await this.#findKeyring(address)
    const keyringAddresses = keyring.getAddressesForAccount(
      QUAI_HD_WALLET_ACCOUNT_INDEX
    )
    if (
      keyringAddresses.every(
        (keyringAddress) => this.#hiddenAccounts[keyringAddress.address]
      )
    ) {
      keyringAddresses.forEach((keyringAddress) => {
        delete this.#hiddenAccounts[keyringAddress.address]
      })
      this.#removeKeyring(keyring.xPub)
    }
    await this.persistKeyrings()
    this.emitKeyrings()
  }

  #removeKeyring(keyringId: string) {
    const filteredKeyrings = this.quaiHDWallets.filter(
      (keyring) => keyring.xPub !== keyringId
    )

    if (filteredKeyrings.length === this.quaiHDWallets.length) {
      throw new Error(
        `Attempting to remove keyring that does not exist. id: (${keyringId})`
      )
    }
    this.quaiHDWallets = filteredKeyrings
  }

  #removePrivateKey(address: HexString): Wallet[] {
    const filteredPrivateKeys = this.wallets.filter(
      (wallet) => !sameEVMAddress(wallet.address, address)
    )

    if (filteredPrivateKeys.length === this.wallets.length) {
      throw new Error(
        `Attempting to remove wallet that does not exist. Address: (${address})`
      )
    }

    this.wallets = filteredPrivateKeys
    delete this.#keyringMetadata[normalizeEVMAddress(address)]

    return filteredPrivateKeys
  }

  /**
   * Find keyring associated with an account.
   *
   * @param account - the account address desired to search the keyring for.
   * @returns HD keyring object
   */
  #findKeyringNew(account: AddressLike): QuaiHDWallet | null {
    const keyring = this.quaiHDWallets.find((kr) =>
      kr
        .getAddressesForAccount(QUAI_HD_WALLET_ACCOUNT_INDEX)
        .find((address) => address.address === account)
    )

    return keyring ?? null
  }

  /**
   * Find keyring associated with an account.
   *
   * @param account - the account desired to search the keyring for.
   */
  async #findKeyring(account: HexString): Promise<QuaiHDWallet> {
    const keyring = this.quaiHDWallets.find(
      (kr, index) =>
        kr.getAddressesForAccount(QUAI_HD_WALLET_ACCOUNT_INDEX)[index]
          .address === account
    )
    if (!keyring) {
      throw new Error("Address keyring not found.")
    }

    return keyring
  }

  /**
   * Find a wallet imported with a private key
   *
   * @param account - the account address desired to search the wallet for.
   * @returns Ether's Wallet object
   */
  #findPrivateKey(account: AddressLike): Wallet | null {
    const privateKey = this.wallets.find(
      (item) => sameEVMAddress(item.address, account as string) // TODO-MIGRATION
    )

    return privateKey ?? null
  }

  async signTransaction(txRequest: QuaiTransactionRequest): Promise<string> {
    this.requireUnlocked()

    const fromAddress = txRequest.from
    const signerWithType = this.#findSigner(fromAddress)
    if (!signerWithType) {
      throw new Error(
        `Signing transaction failed. Signer for address ${fromAddress} was not found.`
      )
    }

    return signerWithType.signer.signTransaction(txRequest)
  }

  /**
   * Sign typed data based on EIP-712 with the usage of eth_signTypedData_v4 method,
   * more information about the EIP can be found at https://eips.ethereum.org/EIPS/eip-712
   *
   * @param typedData - the data to be signed
   * @param account - signers account address
   */
  async signTypedData({
    typedData,
    account,
  }: {
    typedData: EIP712TypedData
    account: HexString
  }): Promise<string> {
    this.requireUnlocked()
    const { domain, types, message } = typedData
    const { EIP712Domain, ...typesForSigning } = types

    const signerWithType = this.#findSigner(account)
    if (!signerWithType)
      throw new Error(
        `Signing transaction failed. Signer for address ${account} was not found.`
      )

    try {
      return isPrivateKey(signerWithType)
        ? await signerWithType.signer.signTypedData(
            domain,
            typesForSigning,
            message
          )
        : await signerWithType.signer.signTypedData(
            account,
            domain,
            typesForSigning,
            message
          )
    } catch (error) {
      throw new Error("Signing data failed")
    }
  }

  /**
   * Sign data based on EIP-191 with the usage of personal_sign method,
   * more information about the EIP can be found at https://eips.ethereum.org/EIPS/eip-191
   *
   * @param signingData - the data to be signed
   * @param account - signers account address
   */
  async personalSign({
    signingData,
    account,
  }: {
    signingData: HexString
    account: HexString
  }): Promise<string> {
    this.requireUnlocked()

    const signerWithType = this.#findSigner(account)
    if (!signerWithType)
      throw new Error(
        `Signing transaction failed. Signer for address ${account} was not found.`
      )

    try {
      const messageBytes = getBytes(signingData)
      return isPrivateKey(signerWithType)
        ? await signerWithType.signer.signMessage(messageBytes)
        : await signerWithType.signer.signMessage(account, messageBytes)
    } catch (error) {
      throw new Error("Signing data failed")
    }
  }

  private emitKeyrings() {
    if (this.locked()) {
      this.emitter.emit("keyrings", {
        privateKeys: [],
        keyrings: [],
        keyringMetadata: {},
      })
    } else {
      const quaiHDWallets = this.getKeyrings()
      const privateKeys = this.getPrivateKeys()

      this.emitter.emit("keyrings", {
        privateKeys,
        keyrings: quaiHDWallets,
        keyringMetadata: { ...this.#keyringMetadata },
      })
    }
  }

  /// ////////////////////////////////////// Vaults methods /////////////////////////////////////////
  private async loadKeyrings(password: string) {
    try {
      const { vaults } = await getEncryptedVaults()
      const currentEncryptedVault = vaults.slice(-1)[0]?.vault
      if (!currentEncryptedVault) return

      const saltedKey = await deriveSymmetricKeyFromPassword(
        password,
        currentEncryptedVault.salt
      )

      const plainTextVault: SerializedVaultData = await decryptVault(
        currentEncryptedVault,
        saltedKey
      )

      this.#cachedKey = saltedKey
      this.wallets = []
      this.quaiHDWallets = []
      this.#keyringMetadata = {}
      this.#hiddenAccounts = {}

      plainTextVault.wallets?.forEach((pk) =>
        this.wallets.push(new Wallet(pk.privateKey))
      )

      for (const walletData of plainTextVault.quaiHDWallets) {
        const deserializedQuaiHDWallet = await QuaiHDWallet.deserialize(
          walletData
        )
        this.quaiHDWallets.push(deserializedQuaiHDWallet)
      }
      this.#keyringMetadata = {
        ...plainTextVault.metadata,
      }

      this.#hiddenAccounts = {
        ...plainTextVault.hiddenAccounts,
      }

      this.emitKeyrings()
    } catch (err) {
      logger.error("Error while loading vault", err)
    }
  }

  private async persistKeyrings() {
    this.requireUnlocked()

    const serializedQuaiHDWallets: SerializedHDWallet[] =
      this.quaiHDWallets.map((quaiHDWallet) => quaiHDWallet.serialize())

    const serializedWallets: SerializedPrivateKey[] = this.wallets.map(
      (wallet) => {
        const { privateKey } = wallet
        const signingKey = new SigningKey(privateKey)
        const { publicKey } = signingKey

        return {
          version: 1,
          id: publicKey,
          privateKey,
        }
      }
    )

    const hiddenAccounts = { ...this.#hiddenAccounts }
    const metadata = { ...this.#keyringMetadata }

    const serializedVaultData: SerializedVaultData = {
      wallets: serializedWallets,
      quaiHDWallets: serializedQuaiHDWallets,
      metadata,
      hiddenAccounts,
    }
    const encryptedVault = await encryptVault(
      serializedVaultData,
      // @ts-ignore this.#cachedKey won't be undefined | null due to requireUnlocked
      this.#cachedKey
    )

    await writeLatestEncryptedVault(encryptedVault)
  }
}
