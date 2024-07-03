import {
  getZoneForAddress,
  toBigInt,
  Zone,
  TransactionReceipt,
  Block,
  TransactionResponse,
  QuaiTransaction,
} from "quais"
import { TransactionRequest as EthersTransactionRequest } from "@quais/abstract-provider"

// TODO-MIGRATION: Update TransactionTypes
import { BigNumber, Transaction as EthersTransaction } from "quais-old"
import {
  AnyEVMTransaction,
  AnyEVMBlock,
  EIP1559TransactionRequest,
  ConfirmedEVMTransaction,
  LegacyEVMTransactionRequest,
  isEIP1559TransactionRequest,
  TransactionRequest,
  isEIP1559SignedTransaction,
  SignedTransaction,
  isKnownTxType,
  KnownTxTypes,
} from "../../../networks"
import { NetworkInterfaceGA } from "../../../constants/networks/networkTypes"
import {
  ConfirmedQuaiTransactionLike,
  FailedQuaiTransactionLike,
  PendingQuaiTransactionLike,
} from "../types"
/**
 * Parse a block as returned by a polling provider.
 */
export function blockFromEthersBlock(
  network: NetworkInterfaceGA,
  block: Block
): AnyEVMBlock {
  if (!block) throw new Error("Failed get Block")

  // TODO-MIGRATION: CHECK BLOCK (blockHeight and parentHash)
  return {
    hash: block.woBody.header.hash,
    blockHeight: Number(block.woBody.header.number[2]),
    parentHash: block.woBody.header.parentHash[2],
    difficulty: 0n,
    timestamp: block.date?.getTime(),
    baseFeePerGas: block.woBody.header.baseFeePerGas,
    network,
  } as AnyEVMBlock
}

/**
 * Parse a block as returned by a provider query.
 */
export function blockFromProviderBlock(
  network: NetworkInterfaceGA,
  incomingGethResult: unknown
): AnyEVMBlock {
  const gethResult = incomingGethResult as {
    hash: string
    number: string
    parentHash: string
    difficulty: string
    timestamp: string
    baseFeePerGas?: string
  }

  const blockNumber: string = Array.isArray(gethResult.number)
    ? gethResult.number[gethResult.number.length - 1]
    : gethResult.number

  return {
    hash: gethResult.hash,
    blockHeight: Number(toBigInt(blockNumber)),
    parentHash: gethResult.parentHash,
    // PoS networks will not have block difficulty.
    difficulty: gethResult.difficulty ? BigInt(gethResult.difficulty) : 0n,
    timestamp: Number(toBigInt(gethResult.timestamp)),
    baseFeePerGas: gethResult.baseFeePerGas
      ? BigInt(gethResult.baseFeePerGas)
      : undefined,
    network,
  }
}

export function ethersTransactionRequestFromEIP1559TransactionRequest(
  transaction: EIP1559TransactionRequest
): EthersTransactionRequest {
  return {
    to: transaction.to,
    data: transaction.input ?? undefined,
    from: transaction.from,
    type: transaction.type,
    nonce: transaction.nonce,
    value: transaction.value,
    chainId: parseInt(transaction.chainID, 10),
    gasLimit: transaction.gasLimit,
    maxFeePerGas: transaction.maxFeePerGas,
    maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
    externalGasLimit: transaction.externalGasLimit ?? undefined,
    externalGasPrice: transaction.externalGasPrice ?? undefined,
    externalGasTip: transaction.externalGasTip ?? undefined,
  }
}

export function ethersTransactionRequestFromLegacyTransactionRequest(
  transaction: LegacyEVMTransactionRequest
): EthersTransactionRequest {
  const { to, input, type, nonce, gasPrice, value, chainID, gasLimit, from } =
    transaction

  return {
    from,
    to,
    data: input ?? undefined,
    type: type ?? undefined,
    nonce,
    gasPrice,
    value,
    chainId: parseInt(chainID, 10),
    gasLimit,
  }
}

export function ethersTransactionFromTransactionRequest(
  transactionRequest: TransactionRequest
): EthersTransactionRequest {
  if (isEIP1559TransactionRequest(transactionRequest))
    return ethersTransactionRequestFromEIP1559TransactionRequest(
      transactionRequest
    )

  // Legacy Transaction
  return ethersTransactionRequestFromLegacyTransactionRequest(
    transactionRequest
  )
}

function eip1559TransactionRequestFromEthersTransactionRequest(
  transaction: EthersTransactionRequest
): Partial<EIP1559TransactionRequest> {
  return {
    to: transaction.to,
    input: transaction.data?.toString() ?? null,
    from: transaction.from,
    type: transaction.type as KnownTxTypes,
    nonce:
      typeof transaction.nonce !== "undefined"
        ? parseInt(transaction.nonce.toString(), 16)
        : undefined,
    value:
      typeof transaction.value !== "undefined"
        ? BigInt(transaction.value.toString())
        : undefined,
    chainID: transaction.chainId?.toString(16),
    gasLimit:
      typeof transaction.gasLimit !== "undefined"
        ? BigInt(transaction.gasLimit.toString())
        : undefined,
    maxFeePerGas:
      typeof transaction.maxFeePerGas !== "undefined"
        ? BigInt(transaction.maxFeePerGas.toString())
        : undefined,
    maxPriorityFeePerGas:
      typeof transaction.maxPriorityFeePerGas !== "undefined"
        ? BigInt(transaction.maxPriorityFeePerGas.toString())
        : undefined,
  }
}

function legacyEVMTransactionRequestFromEthersTransactionRequest(
  transaction: EthersTransactionRequest
): Partial<LegacyEVMTransactionRequest> {
  return {
    to: transaction.to,
    input: transaction.data?.toString() ?? null,
    from: transaction.from,
    type: transaction.type as 0,
    nonce:
      typeof transaction.nonce !== "undefined"
        ? parseInt(transaction.nonce.toString(), 16)
        : undefined,
    value:
      // Some Dapps may send us transactionRequests with value set to `null`.
      // If transaction.value === 0, we are fine to cast it to undefined on the LegacyEVMTransactionRequest
      transaction.value ? BigInt(transaction.value.toString()) : undefined,
    chainID: transaction.chainId?.toString(16),
    gasLimit:
      typeof transaction.gasLimit !== "undefined"
        ? BigInt(transaction.gasLimit.toString())
        : undefined,
    gasPrice:
      typeof transaction.gasPrice !== "undefined"
        ? BigInt(transaction.gasPrice.toString())
        : undefined,
  }
}

export function transactionRequestFromEthersTransactionRequest(
  ethersTransactionRequest: EthersTransactionRequest
): Partial<TransactionRequest> {
  if (isEIP1559TransactionRequest(ethersTransactionRequest))
    return eip1559TransactionRequestFromEthersTransactionRequest(
      ethersTransactionRequest
    )

  return legacyEVMTransactionRequestFromEthersTransactionRequest(
    ethersTransactionRequest
  )
}

export function ethersTransactionFromSignedTransaction(
  tx: SignedTransaction
): EthersTransaction {
  const baseTx: EthersTransaction = {
    nonce: Number(tx.nonce),
    // TODO-MIGRATION: Update with to: tx.to ?? null
    to: tx.to,
    data: tx.input || "",
    // TODO-MIGRATION: Update with gasPrice: tx.gasPrice ? toBigInt(tx.gasPrice) : null,
    gasPrice: tx.gasPrice ? BigNumber.from(tx.gasPrice) : undefined,
    type: tx.type,
    // TODO-MIGRATION: Update with chainId: toBigInt(tx.network.chainID)
    chainId: parseInt(tx.network.chainID, 10),
    // TODO-MIGRATION: Update with value: toBigInt(tx.value),
    value: BigNumber.from(tx.value),
    // TODO-MIGRATION: Update with gasLimit: toBigInt(tx.gasLimit),
    gasLimit: BigNumber.from(tx.gasLimit),
  }

  if (isEIP1559SignedTransaction(tx))
    return {
      ...baseTx,
      // TODO-MIGRATION: Update with maxFeePerGas: toBigInt(tx.maxFeePerGas!)
      maxFeePerGas: BigNumber.from(tx.maxFeePerGas),
      // TODO-MIGRATION: Update with maxPriorityFeePerGas: toBigInt(tx.maxPriorityFeePerGas!)
      maxPriorityFeePerGas: BigNumber.from(tx.maxPriorityFeePerGas),
      r: tx.r,
      from: tx.from,
      s: tx.s,
      v: tx.v,
    }

  return baseTx
}

/**
 * Parse a transaction as returned by a websocket provider subscription.
 */
export function enrichTransactionWithReceipt(
  transaction: AnyEVMTransaction | QuaiTransaction,
  receipt: TransactionReceipt
): ConfirmedEVMTransaction {
  const { gasUsed } = receipt

  return {
    ...transaction,
    gasUsed,
    /* Despite the [ethers js docs](https://docs.ethers.io/v5/api/providers/types/) stating that
     * receipt.effectiveGasPrice "will simply be equal to the transaction gasPrice" on chains
     * that do not support EIP-1559 - it seems that this is not yet the case with Optimism.
     *
     * The `?? transaction.gasPrice` code fixes a bug where transaction enrichment was fails
     *  due to effectiveGasPrice being undefined and calling .toBigInt on it.
     *
     * This is not a perfect solution because transaction.gasPrice does not necessarily take
     * into account L1 rollup fees.
     */
    // TODO-MIGRATION new type does not have effectiveGasPrice
    // gasPrice: receipt.effectiveGasPrice?.toBigInt() ?? transaction.gasPrice,
    gasPrice: receipt.gasPrice,
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore TODO-MIGRATION ignoring for now
    logs: receipt.logs.map(({ address, data, topics }) => ({
      contractAddress: address,
      data,
      topics,
    })),
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore TODO-MIGRATION ignoring for now
    etxs: receipt.etxs,
    status:
      receipt.status ??
      // Pre-Byzantium transactions require a guesswork approach or an
      // eth_call; we go for guesswork.
      (gasUsed === transaction.gasLimit ? 0 : 1),
    blockHash: receipt.blockHash,
    blockHeight: receipt.blockNumber,
  }
}

// /**
//  * Parse a transaction as returned by a polling provider.
//  */
// export function transactionFromEthersTransaction(
//   tx: TransactionResponse | EthersTransaction,
//   network: NetworkInterfaceGA
// ):
//   | ConfirmedQuaiTransactionLike
//   | PendingQuaiTransactionLike
//   | FailedQuaiTransactionLike {
//   if (!tx || tx.hash === undefined) {
//     throw new Error("Malformed transaction")
//   }
//   if (!isKnownTxType(tx.type)) {
//     throw new Error(`Unknown transaction type ${tx.type}`)
//   }
//
//   // TODO-MIGRATION: Remove this (currently using only for type)
//   const temporaryTx = tx as EthersTransaction & {
//     from: string
//     blockHash?: string
//     blockNumber?: number
//     type?: number | null
//   }
//
//   const newTx = {
//     hash: temporaryTx.hash,
//     from: temporaryTx.from,
//     to: temporaryTx.to ?? undefined,
//     nonce: parseInt(temporaryTx.nonce.toString(), 10),
//     // TODO-MIGRATION: Update with gasLimit: toBigInt(tx.gasLimit)
//     gasLimit: temporaryTx.gasLimit,
//     // TODO-MIGRATION: Update with gasPrice: tx.gasPrice ? toBigInt(tx.gasPrice) : null
//     gasPrice: temporaryTx.gasPrice ? temporaryTx.gasPrice : null,
//     // TODO-MIGRATION: Update with maxFeePerGas: tx.maxFeePerGas ? toBigInt(tx.maxFeePerGas) : null
//     maxFeePerGas: temporaryTx.maxFeePerGas ? temporaryTx.maxFeePerGas : null,
//     // TODO-MIGRATION: Update with maxPriorityFeePerGas: tx.maxPriorityFeePerGas
//     //       ? toBigInt(tx.maxPriorityFeePerGas)
//     //       : null
//     maxPriorityFeePerGas: temporaryTx.maxPriorityFeePerGas
//       ? temporaryTx.maxPriorityFeePerGas
//       : null,
//     // TODO-MIGRATION: Update with value: toBigInt(tx.value)
//     value: temporaryTx.value,
//     input: temporaryTx.data,
//     type: temporaryTx.type,
//     blockHash: temporaryTx.blockHash || null,
//     blockHeight: temporaryTx.blockNumber || null,
//     network,
//     asset: network.baseAsset,
//   } as const // narrow types for compatiblity with our internal ones
//
//   if (temporaryTx.r && temporaryTx.s && temporaryTx.v) {
//     // TODO-MIGARTION: Update any type with signedTx
//     const signedTx: any = {
//       ...newTx,
//       r: temporaryTx.r,
//       s: temporaryTx.s,
//       v: temporaryTx.v,
//     }
//     return signedTx
//   }
//
//   // TODO-MIGARTION: Remove any type
//   return newTx as any
// }

export const getExtendedZoneForAddress = (
  address: string,
  inHumanForm = true,
  capitalizeFirstLetter = false
): string => {
  const zone = getZoneForAddress(address)

  if (!zone) return ""
  if (!inHumanForm) return zone

  for (let i = 0; i < Object.entries(Zone).length; i + 1) {
    const [key, enumValue] = Object.entries(Zone)[i]
    if (enumValue === zone) {
      const match = key.match(/([a-zA-Z]+)(\d+)/)

      if (match) {
        const [, letters, number] = match

        return capitalizeFirstLetter
          ? `${letters}-${number}`
          : `${letters.toLowerCase()}-${number}`
      }
    }
  }

  return ""
}
