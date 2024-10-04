import { Contract, Mnemonic, QiHDWallet, Zone } from "quais"
import { generateRandomBytes } from "../utils"
import { IVaultManager } from "../vault-manager"
import { AddressWithQiHDWallet } from "../types"
import { MAILBOX_INTERFACE } from "../../../contracts/payment-channel-mailbox"

export interface IQiHDWalletManager {
  get(): Promise<QiHDWallet | null>
  create(): Promise<AddressWithQiHDWallet>
  deriveAddress(zone: Zone): Promise<AddressWithQiHDWallet>
}

export default class QiHDWalletManager implements IQiHDWalletManager {
  public readonly qiHDWalletAccountIndex: number = 0

  constructor(private vaultManager: IVaultManager) {}

  // -------------------------- public methods --------------------------
  public async create(): Promise<AddressWithQiHDWallet> {
    const { phrase } = Mnemonic.fromEntropy(generateRandomBytes(24))
    const mnemonic = Mnemonic.fromPhrase(phrase)
    const qiHDWallet = QiHDWallet.fromMnemonic(mnemonic)

    const existingQiHDWallet = await this.get()
    if (existingQiHDWallet) {
      throw new Error("Qi HD Wallet already in use")
    }

    const { address } = await qiHDWallet.getNextAddress(
      this.qiHDWalletAccountIndex,
      Zone.Cyprus1
    )

    return { address, qiHDWallet }
  }

  public async get(): Promise<QiHDWallet | null> {
    const { qiHDWallet } = await this.vaultManager.get()
    if (!qiHDWallet) return null

    return QiHDWallet.deserialize(qiHDWallet)
  }

  public async deriveAddress(zone: Zone): Promise<AddressWithQiHDWallet> {
    const qiHDWallet = await this.get()
    if (!qiHDWallet) {
      throw new Error("QiHDWallet was not found.")
    }

    const { address } = await qiHDWallet.getNextAddress(
      this.qiHDWalletAccountIndex,
      zone
    )

    return { address, qiHDWallet }
  }

  public async syncQiWalletPaymentCodes(): Promise<void> {
    const qiWallet = await this.get()
    if (!qiWallet) {
      throw new Error("QiHDWallet was not found.")
    }

    const receiverPaymentCode = await qiWallet.getPaymentCode(
      this.qiHDWalletAccountIndex
    )

    const { jsonRpcProvider } = globalThis.main.chainService
    const mailboxContract = new Contract(
      process.env.MAILBOX_CONTRACT_ADDRESS || "",
      MAILBOX_INTERFACE,
      jsonRpcProvider
    )
    const paymentCodesToOpenChannelsTo: string[] =
      await mailboxContract.getNotifications(receiverPaymentCode)
    console.log("paymentCodesToOpenChannelsTo", paymentCodesToOpenChannelsTo)

    // paymentCodesToOpenChannelsTo.forEach((paymentCode) => {
    //   qiWallet.openChannel(paymentCode, "sender")
    // })
    // qiWallet.sync(Zone.Cyprus1, 0)
  }
}
