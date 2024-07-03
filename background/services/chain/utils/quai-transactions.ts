import { TransactionReceiptParams } from "quais"
import { QuaiTransactionLike } from "quais/lib/commonjs/transaction/quai-transaction"
import { QuaiTransactionResponseParams } from "quais/lib/commonjs/providers/formatting"

import {
  ConfirmedQuaiTransactionLike,
  FailedQuaiTransactionLike,
  PendingQuaiTransactionLike,
  QuaiTransactionStatus,
} from "../types"

export const createFailedQuaiTransaction = (
  transaction: QuaiTransactionLike,
  error?: string
): FailedQuaiTransactionLike => {
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
): ConfirmedQuaiTransactionLike => {
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
  transaction: QuaiTransactionLike,
  responseParams: QuaiTransactionResponseParams
): PendingQuaiTransactionLike => {
  return {
    ...transaction,
    ...responseParams,
    status: QuaiTransactionStatus.PENDING,
  }
}
