import { TransactionReceiptParams } from "quais"
import { QuaiTransactionResponse } from "quais/lib/commonjs/providers"
import { QuaiTransactionLike } from "quais/lib/commonjs/transaction/quai-transaction"
import {
  ConfirmedQuaiTransaction,
  FailedQuaiTransaction,
  PendingQuaiTransaction,
  QuaiTransactionStatus,
} from "../types"

export const createFailedQuaiTransaction = (
  transaction: QuaiTransactionResponse | QuaiTransactionLike,
  error?: string
): FailedQuaiTransaction => {
  return {
    ...transaction,
    status: QuaiTransactionStatus.FAILED,
    error: error || "Unknown error",
    blockHash: null,
    blockHeight: null,
  }
}

export const createConfirmedQuaiTransaction = (
  transaction: QuaiTransactionLike,
  receipt: TransactionReceiptParams
): ConfirmedQuaiTransaction => {
  const {
    nonce,
    gasLimit,
    maxPriorityFeePerGas,
    maxFeePerGas,
    data,
    value,
    accessList,
  } = transaction

  const { status, ...rest } = receipt

  return {
    status: QuaiTransactionStatus.CONFIRMED,
    nonce,
    gasLimit,
    maxPriorityFeePerGas,
    maxFeePerGas,
    data,
    value,
    accessList,
    ...rest,
  }
}

export const createPendingQuaiTransaction = (
  responseParams: QuaiTransactionResponse
): PendingQuaiTransaction => {
  return {
    ...responseParams,
    status: QuaiTransactionStatus.PENDING,
  }
}
