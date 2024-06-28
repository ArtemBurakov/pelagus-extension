import { Contract, getAddress, TransactionRequest } from "quais"
import { QuaiTransactionRequest } from "quais/lib/commonjs/providers"
import { QRC20_INTERFACE } from "../contracts/qrc-20"

import {
  AnyAsset,
  AnyAssetAmount,
  AnyAssetMetadata,
  flipPricePoint,
  isFungibleAsset,
  isSmartContractFungibleAsset,
  PricePoint,
  SmartContractFungibleAsset,
} from "../assets"
import { AddressOnNetwork } from "../accounts"
import { createBackgroundAsyncThunk } from "./utils"
import { isBuiltInNetworkBaseAsset, isSameAsset } from "./utils/asset-utils"
import { getProvider } from "./utils/contract-utils"
import { EIP1559TransactionRequest, EVMNetwork, sameNetwork } from "../networks"
import logger from "../lib/logger"
import { QUAI } from "../constants"
import { convertFixedPoint } from "../lib/fixed-point"
import { removeAssetReferences, updateAssetReferences } from "./accounts"
import { NormalizedEVMAddress } from "../types"
import type { RootState } from "."
import { emitter as transactionConstructionSliceEmitter } from "./transaction-construction"
import { AccountSigner } from "../services/signing"
import { normalizeEVMAddress } from "../lib/utils"
import { setSnackbarMessage } from "./ui"
import { getExtendedZoneForAddress } from "../services/chain/utils"
import { createSelector, createSlice } from "@reduxjs/toolkit"

export type AssetWithRecentPrices<T extends AnyAsset = AnyAsset> = T & {
  recentPrices: {
    [assetSymbol: string]: PricePoint
  }
}

export type SingleAssetState = AssetWithRecentPrices

export type AssetsState = SingleAssetState[]

export const initialState = [] as AssetsState

const assetsSlice = createSlice({
  name: "assets",
  initialState,
  reducers: {
    assetsLoaded: (
      immerState,
      { payload: newAssets }: { payload: AnyAsset[] }
    ) => {
      const mappedAssets: { [sym: string]: SingleAssetState[] } = {}
      // bin existing known assets
      immerState.forEach((asset) => {
        if (mappedAssets[asset.symbol] === undefined) {
          mappedAssets[asset.symbol] = []
        }
        // if an asset is already in state, assume unique checks have been done
        // no need to check network, contract address, etc
        mappedAssets[asset.symbol].push(asset)
      })
      // merge in new assets
      newAssets.forEach((newAsset) => {
        if (mappedAssets[newAsset.symbol] === undefined) {
          mappedAssets[newAsset.symbol] = [
            {
              ...newAsset,
              recentPrices: {},
            },
          ]
        } else {
          const duplicateIndexes = mappedAssets[newAsset.symbol].reduce<
            number[]
          >((acc, existingAsset, id) => {
            if (isSameAsset(newAsset, existingAsset)) {
              acc.push(id)
            }
            return acc
          }, [])

          // if there aren't duplicates, add the asset
          if (duplicateIndexes.length === 0) {
            mappedAssets[newAsset.symbol].push({
              ...newAsset,
              recentPrices: {},
            })
          } else {
            // TODO if there are duplicates... when should we replace assets?
            duplicateIndexes.forEach((id) => {
              // Update only the metadata for the duplicate
              mappedAssets[newAsset.symbol][id] = {
                ...mappedAssets[newAsset.symbol][id],
                metadata: newAsset.metadata,
              }
            })
          }
        }
      })

      return Object.values(mappedAssets).flat()
    },
    removeAsset: (
      immerState,
      { payload: removedAsset }: { payload: AnyAsset }
    ) => {
      return immerState.filter((asset) => !isSameAsset(asset, removedAsset))
    },
  },
})

export const { assetsLoaded, removeAsset } = assetsSlice.actions

export default assetsSlice.reducer

const selectAssetsState = (state: AssetsState) => state
const selectAsset = (_: AssetsState, asset: AnyAsset) => asset

const selectPairedAssetSymbol = (
  _: AssetsState,
  _2: AnyAsset,
  pairedAssetSymbol: string
) => pairedAssetSymbol

export const updateAssetMetadata = createBackgroundAsyncThunk(
  "assets/updateAssetMetadata",
  async (
    {
      asset,
      metadata,
    }: {
      asset: SmartContractFungibleAsset
      metadata: AnyAssetMetadata
    },
    { extra: { main } }
  ) => {
    await main.updateAssetMetadata(asset, metadata)
  }
)

export const refreshAsset = createBackgroundAsyncThunk(
  "assets/refreshAsset",
  async (
    {
      asset,
    }: {
      asset: SmartContractFungibleAsset
    },
    { dispatch }
  ) => {
    await dispatch(assetsLoaded([asset]))
    await dispatch(updateAssetReferences(asset))
  }
)

export const hideAsset = createBackgroundAsyncThunk(
  "assets/hideAsset",
  async (
    {
      asset,
    }: {
      asset: SmartContractFungibleAsset
    },
    { extra: { main } }
  ) => {
    await main.hideAsset(asset)
  }
)

/**
 * Removes the asset from the user interface.
 * The token should be removed from the assets list and all references associated with it.
 */
export const removeAssetData = createBackgroundAsyncThunk(
  "assets/removeAssetData",
  async (
    {
      asset,
    }: {
      asset: SmartContractFungibleAsset
    },
    { dispatch }
  ) => {
    await dispatch(removeAsset(asset))
    await dispatch(removeAssetReferences(asset))
  }
)

export const getAccountNonceAndGasPrice = createBackgroundAsyncThunk(
  "assets/getAccountNonceAndGasPrice",
  async (
    {
      details,
    }: {
      details: {
        network: EVMNetwork
        address: string
      }
    },
    { dispatch }
  ): Promise<{
    nonce: number
    maxFeePerGas: string
    maxPriorityFeePerGas: string
  }> => {
    const prevShard = globalThis.main.GetShard()
    globalThis.main.SetShard(getExtendedZoneForAddress(details.address))
    const provider = globalThis.main.chainService.providerForNetworkOrThrow(
      details.network
    )
    const normalizedAddress = normalizeEVMAddress(details.address)
    const nonce = await provider.getTransactionCount(
      normalizedAddress,
      "pending"
    )
    const feeData = await provider.getFeeData()
    globalThis.main.SetShard(prevShard)
    if (
      feeData.gasPrice == undefined ||
      feeData.maxFeePerGas == undefined ||
      feeData.maxPriorityFeePerGas == undefined
    ) {
      dispatch(
        setSnackbarMessage("Failed to get gas price, please enter manually")
      )
    }
    return {
      nonce,
      maxFeePerGas: feeData.maxFeePerGas
        ? feeData.maxFeePerGas.toString()
        : "0",
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
        ? feeData.maxPriorityFeePerGas.toString()
        : "0",
    }
  }
)

export const sendAsset = createBackgroundAsyncThunk(
  "assets/sendAsset",
  async (transferDetails: {
    fromAddressNetwork: AddressOnNetwork
    toAddressNetwork: AddressOnNetwork
    assetAmount: AnyAssetAmount
    gasLimit?: bigint
    nonce?: number
    maxPriorityFeePerGas?: bigint & BigInt
    maxFeePerGas?: bigint & BigInt
    accountSigner: AccountSigner
  }): Promise<{ success: boolean; errorMessage?: string }> => {
    let {
      fromAddressNetwork: { address: fromAddress, network: fromNetwork },
      toAddressNetwork: { address: toAddress, network: toNetwork },
      assetAmount,
      gasLimit,
      nonce,
      maxPriorityFeePerGas,
      maxFeePerGas,
      accountSigner,
    } = transferDetails

    try {
      if (!sameNetwork(fromNetwork, toNetwork)) {
        return {
          success: false,
          errorMessage: "Only same-network transfers are supported for now.",
        }
      }

      let transactionData = ""
      let transactionValue = assetAmount.amount

      if (isSmartContractFungibleAsset(assetAmount.asset)) {
        const provider = getProvider()
        const signer = await provider.getSigner(fromAddress)

        const tokenContract = new Contract(
          assetAmount.asset.contractAddress,
          QRC20_INTERFACE,
          signer
        )

        const transactionDetails =
          await tokenContract.transfer.populateTransaction(
            toAddress,
            assetAmount.amount
          )

        toAddress = transactionDetails.to ? transactionDetails.to : ""
        transactionData = transactionDetails.data ? transactionDetails.data : ""
        transactionValue = BigInt(0)
      }

      const request: QuaiTransactionRequest = {
        to: getAddress(toAddress),
        from: getAddress(fromAddress),
        nonce: nonce,
        gasLimit: gasLimit,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        maxFeePerGas: maxFeePerGas,
        data: transactionData,
        value: transactionValue,
      }
      await signTransaction({ request, accountSigner })

      return { success: true }
    } catch (error) {
      return {
        success: false,
        errorMessage: `Transfer failed: ${error}`,
      }
    }
  }
)

/**
 * Executes an asset transfer between two addresses, for a set amount. Supports
 * an optional fixed gas limit.
 *
 * If the from address is not a writeable address in the wallet, this signature
 * will not be possible.
 */
export const transferAsset = createBackgroundAsyncThunk(
  "assets/transferAsset",
  async (transferDetails: {
    fromAddressNetwork: AddressOnNetwork
    toAddressNetwork: AddressOnNetwork
    assetAmount: AnyAssetAmount
    gasLimit?: bigint
    nonce?: number
    maxPriorityFeePerGas?: bigint & BigInt
    maxFeePerGas?: bigint & BigInt
    accountSigner: AccountSigner
  }): Promise<{ success: boolean; errorMessage?: string }> => {
    try {
      let {
        fromAddressNetwork: { address: fromAddress, network: fromNetwork },
        toAddressNetwork: { address: toAddress, network: toNetwork },
        assetAmount,
        gasLimit,
        nonce,
        maxPriorityFeePerGas,
        maxFeePerGas,
        accountSigner,
      } = transferDetails

      if (!fromNetwork.isQuai) {
        return {
          success: false,
          errorMessage:
            "Only base and fungible smart contract asset transfers are supported for now.",
        }
      }

      if (!sameNetwork(fromNetwork, toNetwork)) {
        return {
          success: false,
          errorMessage: "Only same-network transfers are supported for now.",
        }
      }

      const toShard = getExtendedZoneForAddress(toAddress)
      const fromShard = getExtendedZoneForAddress(fromAddress)
      if (fromShard !== toShard) {
        return {
          success: false,
          errorMessage: "Only same-shard transfers are supported for now.",
        }
      }

      let data = ""
      const provider =
        globalThis.main.chainService.providerForNetworkOrThrow(fromNetwork)
      if (!nonce) {
        nonce = await provider.getTransactionCount(fromAddress)
      }

      if (isSmartContractFungibleAsset(assetAmount.asset)) {
        logger.debug(
          `Sending ${assetAmount.amount} ${assetAmount.asset.symbol} from ` +
            `${fromAddress} to ${toAddress} as an ERC20 transfer.`
        )

        const provider = getProvider()
        const signer = await provider.getSigner(fromAddress)

        const tokenContract = new Contract(
          assetAmount.asset.contractAddress,
          QRC20_INTERFACE,
          signer
        )

        const transactionDetails =
          await tokenContract.transfer.populateTransaction(
            toAddress,
            assetAmount.amount
          )

        toAddress = transactionDetails.to ? transactionDetails.to : ""
        data = transactionDetails.data ? transactionDetails.data : ""
        assetAmount = {
          asset: QUAI,
          amount: BigInt(0),
        }
      }

      const tx = genQuaiRawTransaction(
        fromNetwork,
        fromAddress,
        toAddress,
        assetAmount,
        nonce,
        fromNetwork.chainID,
        data,
        gasLimit ?? BigInt(200000),
        maxFeePerGas ?? BigInt(2000000000),
        maxPriorityFeePerGas ?? BigInt(1000000000)
      )
      signData({ transaction: tx, accountSigner })
      return { success: true }
    } catch (error) {
      return {
        success: false,
        errorMessage: `Transfer failed: ${error}`,
      }
    }
  }
)

function genQuaiRawTransaction(
  network: EVMNetwork,
  fromAddress: string,
  toAddress: string,
  assetAmount: AnyAssetAmount,
  nonce: number,
  chainId: string,
  data: string,
  gasLimit: bigint,
  maxFeePerGas: bigint & BigInt,
  maxPriorityFeePerGas: bigint & BigInt
): EIP1559TransactionRequest {
  return {
    to: toAddress,
    from: fromAddress,
    value: assetAmount.amount,
    nonce,
    gasLimit: gasLimit ?? BigInt(200000),
    maxFeePerGas,
    maxPriorityFeePerGas,
    type: 0,
    chainID: chainId,
    input: data,
    network,
  }
}

/**
 * Selects a particular asset price point given the asset symbol and the paired
 * asset symbol used to price it.
 *
 * For example, calling `selectAssetPricePoint(state.assets, ETH, "USD")`
 * will return the ETH-USD price point, if it exists. Note that this selector
 * guarantees that the returned price point will have the pair in the specified
 * order, so even if the store price point has amounts in the order [USD, ETH],
 * the selector will return them in the order [ETH, USD].
 */
export const selectAssetPricePoint = createSelector(
  [selectAssetsState, selectAsset, selectPairedAssetSymbol],
  (assets, assetToFind, pairedAssetSymbol) => {
    const hasRecentPriceData = (asset: SingleAssetState): boolean =>
      pairedAssetSymbol in asset.recentPrices &&
      asset.recentPrices[pairedAssetSymbol].pair.some(
        ({ symbol }) => symbol === assetToFind.symbol
      )

    let pricedAsset: SingleAssetState | undefined

    /* If we're looking for a smart contract, try to find an exact price point */
    if (isSmartContractFungibleAsset(assetToFind)) {
      pricedAsset = assets.find(
        (asset): asset is AssetWithRecentPrices<SmartContractFungibleAsset> =>
          isSmartContractFungibleAsset(asset) &&
          asset.contractAddress === assetToFind.contractAddress &&
          asset.homeNetwork.chainID === assetToFind.homeNetwork.chainID &&
          hasRecentPriceData(asset)
      )

      /* Don't do anything else if this is an unverified asset and there's no exact match */
      if (
        (assetToFind.metadata?.tokenLists?.length ?? 0) < 1 &&
        !isBuiltInNetworkBaseAsset(assetToFind, assetToFind.homeNetwork)
      )
        return undefined
    }

    /* Otherwise, find a best-effort match by looking for assets with the same symbol  */
    if (!pricedAsset) {
      pricedAsset = assets.find(
        (asset) =>
          asset.symbol === assetToFind.symbol && hasRecentPriceData(asset)
      )
    }

    if (pricedAsset) {
      let pricePoint = pricedAsset.recentPrices[pairedAssetSymbol]

      // Flip it if the price point looks like USD-ETH
      if (pricePoint.pair[0].symbol !== assetToFind.symbol) {
        pricePoint = flipPricePoint(pricePoint)
      }

      const assetDecimals = isFungibleAsset(assetToFind)
        ? assetToFind.decimals
        : 0
      const pricePointAssetDecimals = isFungibleAsset(pricePoint.pair[0])
        ? pricePoint.pair[0].decimals
        : 0

      if (assetDecimals !== pricePointAssetDecimals) {
        const { amounts } = pricePoint
        pricePoint = {
          ...pricePoint,
          amounts: [
            convertFixedPoint(
              amounts[0],
              pricePointAssetDecimals,
              assetDecimals
            ),
            amounts[1],
          ],
        }
      }

      return pricePoint
    }

    return undefined
  }
)

export const importCustomToken = createBackgroundAsyncThunk(
  "assets/importCustomToken",
  async (
    {
      asset,
    }: {
      asset: SmartContractFungibleAsset
    },
    { extra: { main } }
  ) => {
    return { success: await main.importCustomToken(asset) }
  }
)

export const checkTokenContractDetails = createBackgroundAsyncThunk(
  "assets/checkTokenContractDetails",
  async (
    {
      contractAddress,
      network,
    }: { contractAddress: NormalizedEVMAddress; network: EVMNetwork },
    { getState, extra: { main } }
  ) => {
    const state = getState() as RootState
    const currentAccount = state.ui.selectedAccount

    try {
      return await main.queryCustomTokenDetails(contractAddress, {
        ...currentAccount,
        network,
      })
    } catch (error) {
      console.log(error)
      return null
    }
  }
)

const signTransaction = async ({
  request,
  accountSigner,
}: {
  request: QuaiTransactionRequest
  accountSigner: AccountSigner
}) => {
  await transactionConstructionSliceEmitter.emit("signTransaction", {
    request,
    accountSigner,
  })
}

const signData = async function ({
  transaction,
  accountSigner,
}: {
  transaction: EIP1559TransactionRequest
  accountSigner: AccountSigner
}) {
  transactionConstructionSliceEmitter.emit("requestSignature", {
    request: transaction,
    accountSigner,
  })
}
