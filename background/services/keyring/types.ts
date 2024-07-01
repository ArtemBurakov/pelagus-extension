import { HexString, KeyringTypes } from "../../types"
import { ServiceLifecycleEvents } from "../types"
import { SignedTransaction } from "../../networks"
import { QuaiHDWallet, Wallet, Zone } from "quais"
import { SerializedHDWallet } from "quais/lib/commonjs/wallet/hdwallet"

export type Keyring = {
  type: KeyringTypes
  id: string | null
  path: string | null
  addresses: string[]
}
export type PrivateKey = Keyring & {
  type: KeyringTypes.singleSECP
  path: null
  addresses: [string]
}

export type KeyringAccountSigner = {
  type: "keyring"
  keyringID: string
  zone: Zone
}
export type PrivateKeyAccountSigner = {
  type: "private-key"
  walletID: string
  zone: Zone
}

/////////////////////////////////////////////////////////////////////////////
export type SerializedPrivateKey = {
  version: number
  id: string
  privateKey: string
}

export interface SerializedVaultData {
  wallets: SerializedPrivateKey[]
  quaiHDWallets: SerializedHDWallet[]
  metadata: { [keyringId: string]: { source: SignerImportSource } }
  hiddenAccounts: { [address: HexString]: boolean }
}
/////////////////////////////////////////////////////////////////////////////

export interface Events extends ServiceLifecycleEvents {
  locked: boolean
  keyrings: {
    privateKeys: PrivateKey[]
    keyrings: Keyring[]
    keyringMetadata: {
      [keyringId: string]: { source: SignerImportSource }
    }
  }
  address: string
  // TODO message was signed
  signedTx: SignedTransaction
  signedData: string
}

export enum SignerSourceTypes {
  privateKey = "privateKey",
  keyring = "keyring",
}

export enum SignerImportSource {
  import = "import",
  internal = "internal",
}

type ImportMetadataPrivateKey = {
  type: SignerSourceTypes.privateKey
  privateKey: string
}
type ImportMetadataHDKeyring = {
  type: SignerSourceTypes.keyring
  mnemonic: string
  source: SignerImportSource
  path?: string
}
export type SignerImportMetadata =
  | ImportMetadataPrivateKey
  | ImportMetadataHDKeyring

type InternalSignerHDKeyring = {
  signer: QuaiHDWallet
  type: SignerSourceTypes.keyring
}
export type InternalSignerPrivateKey = {
  signer: Wallet
  type: SignerSourceTypes.privateKey
}
export type InternalSignerWithType =
  | InternalSignerPrivateKey
  | InternalSignerHDKeyring