import { createSelector } from "@reduxjs/toolkit"
import { RootState } from ".."
import { isDefined } from "../../lib/utils/type-guards"
import {
  KeyringAccountSigner,
  PrivateKeyAccountSigner,
} from "../../services/keyring/types"
import { AccountSigner, ReadOnlyAccountSigner } from "../../services/signing"
import { HexString } from "../../types"
import {
  selectKeyringsByAddresses,
  selectPrivateKeyWalletsByAddress,
} from "./keyringsSelectors"
import { selectCurrentAccount } from "./uiSelectors"
import { getExtendedZoneForAddress } from "../../services/chain/utils"
import { getAddress } from "quais"

// FIXME: importing causes a dependency cycle
const getAllAddresses = createSelector(
  (state: RootState) => state.account,
  (account) => [
    ...new Set(
      Object.values(account.accountsData.evm).flatMap((chainAddresses) =>
        Object.keys(chainAddresses)
      )
    ),
  ]
)

export const selectAccountSignersByAddress = createSelector(
  getAllAddresses,
  selectKeyringsByAddresses,
  selectPrivateKeyWalletsByAddress,
  (allAddresses, keyringsByAddress, privateKeyWalletsByAddress) => {
    const allAccountsSeen = new Set<string>()

    const keyringEntries = Object.entries(keyringsByAddress)
      .map(([add, keyring]): [HexString, KeyringAccountSigner] | undefined => {
        if (keyring.id === null) return undefined

        const address = getAddress(add) // TODO-MIGRATION temp fix

        allAccountsSeen.add(address)
        const shard = getExtendedZoneForAddress(address)
        return [
          address,
          {
            type: "keyring",
            keyringID: keyring.id,
            shard,
          },
        ]
      })
      .filter(isDefined)

    const privateKeyEntries = Object.entries(privateKeyWalletsByAddress)
      .map(
        ([add, wallet]): [HexString, PrivateKeyAccountSigner] | undefined => {
          if (wallet.id === null) return undefined

          const address = getAddress(add) // TODO-MIGRATION temp fix

          allAccountsSeen.add(address)
          const shard = getExtendedZoneForAddress(address)

          return [
            address,
            {
              type: "private-key",
              walletID: wallet.id,
              shard,
            },
          ]
        }
      )
      .filter(isDefined)

    const readOnlyEntries: [string, typeof ReadOnlyAccountSigner][] =
      allAddresses
        .filter((address) => !allAccountsSeen.has(getAddress(address))) // TODO-MIGRATION temp fix
        .map((address) => [getAddress(address), ReadOnlyAccountSigner])

    const entriesByPriority: [string, AccountSigner][] = [
      ...readOnlyEntries,
      ...privateKeyEntries,
      ...keyringEntries,
    ]

    console.log("=== entriesByPriority", entriesByPriority)

    return Object.fromEntries(entriesByPriority)
  }
)

export const selectCurrentAccountSigner = createSelector(
  selectAccountSignersByAddress,
  selectCurrentAccount,
  (signingAccounts, selectedAccount) => signingAccounts[selectedAccount.address]
)
