import { TransactionReceiptParams } from "quais"
import { QuaiTransactionRequest } from "quais/lib/commonjs/providers"
import { QuaiTransactionLike } from "quais/lib/commonjs/transaction/quai-transaction"
import { QuaiTransactionResponseParams } from "quais/lib/commonjs/providers/formatting"

import { TransactionAnnotation } from "../../enrichment"
import { NetworkInterfaceGA } from "../../../constants/networks/networkTypes"

export enum QuaiTransactionStatus {
  FAILED = 0,
  PENDING = 1,
  CONFIRMED = 2,
}

export type FailedQuaiTransaction = QuaiTransactionLike & {
  status: QuaiTransactionStatus.FAILED
  error?: string
  blockHash: null
  blockHeight: null
}

export type ConfirmedQuaiTransaction = QuaiTransactionLike &
  TransactionReceiptParams & {
    status: QuaiTransactionStatus.CONFIRMED
  }

export type PendingQuaiTransaction = QuaiTransactionLike &
  QuaiTransactionResponseParams & {
    status: QuaiTransactionStatus.PENDING
  }

export type QuaiTransactionState =
  | FailedQuaiTransaction
  | ConfirmedQuaiTransaction
  | PendingQuaiTransaction

export type EnrichedQuaiTransaction = QuaiTransactionState & {
  annotation?: TransactionAnnotation
  network: NetworkInterfaceGA
}

export type QuaiTransactionRequestWithAnnotation = QuaiTransactionRequest & {
  annotation?: TransactionAnnotation
  network: NetworkInterfaceGA
}
