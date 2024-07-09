import { getZoneForAddress, toBigInt, Zone, Block } from "quais"
import { TransactionRequest as EthersTransactionRequest } from "@quais/abstract-provider"

import {
  AnyEVMBlock,
  EIP1559TransactionRequest,
  LegacyEVMTransactionRequest,
  isEIP1559TransactionRequest,
  TransactionRequest,
  KnownTxTypes,
} from "../../../networks"
import { NetworkInterfaceGA } from "../../../constants/networks/networkTypes"
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

export function transactionRequestFromEthersTransactionRequest(
  ethersTransactionRequest: EthersTransactionRequest
): Partial<TransactionRequest> {
  return eip1559TransactionRequestFromEthersTransactionRequest(
    ethersTransactionRequest
  )
}

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
