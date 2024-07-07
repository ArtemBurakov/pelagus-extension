import { TransactionReceiptParams } from "quais"
import { QuaiTransactionLike } from "quais/lib/commonjs/transaction/quai-transaction"
import { QuaiTransactionResponseParams } from "quais/lib/commonjs/providers/formatting"
import { QuaiTransactionRequest } from "quais/lib/commonjs/providers"
import { TransactionAnnotation } from "../../enrichment"
import { NetworkInterfaceGA } from "../../../constants/networks/networkTypes"

export enum QuaiTransactionStatus {
  FAILED = 0,
  PENDING = 1,
  CONFIRMED = 2,
}

export type FailedQuaiTransactionLike = QuaiTransactionLike & {
  status: QuaiTransactionStatus.FAILED
  error?: string
  blockHash: null
  blockHeight: null
}

export type ConfirmedQuaiTransactionLike = QuaiTransactionLike &
  TransactionReceiptParams & {
    status: QuaiTransactionStatus.CONFIRMED
  }

export type PendingQuaiTransactionLike = QuaiTransactionLike &
  QuaiTransactionResponseParams & {
    status: QuaiTransactionStatus.PENDING
  }

export type QuaiTransactionGeneral =
  | FailedQuaiTransactionLike
  | ConfirmedQuaiTransactionLike
  | PendingQuaiTransactionLike

export type QuaiTransactionGeneralWithAnnotation = QuaiTransactionGeneral & {
  annotation?: TransactionAnnotation
  network: NetworkInterfaceGA
}

export type QuaiTransactionRequestWithAnnotation = QuaiTransactionRequest & {
  annotation?: TransactionAnnotation
  network: NetworkInterfaceGA
}
