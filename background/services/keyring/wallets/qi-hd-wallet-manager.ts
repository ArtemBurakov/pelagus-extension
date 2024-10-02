import { IVaultManager } from "../vault-manager"

export interface IQiHDWalletManager {}

export default class QiHDWalletManager implements IQiHDWalletManager {
  public readonly quaiHDWalletAccountIndex: number = 0

  constructor(private vaultManager: IVaultManager) {}

  // -------------------------- public methods --------------------------
}
