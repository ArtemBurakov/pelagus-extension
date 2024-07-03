import { QuaiTransaction } from "quais"

export enum QuaiTransactionStatus {
  FAILED = 0,
  PENDING = 1,
  CONFIRMED = 2,
}

// /**
//  * A confirmed Quai transaction that has been included in a block. Includes
//  * information about the gas actually used to execute the transaction, as well
//  * as the block hash and block height at which the transaction was included.
//  */
// export interface QuaiLogs {
//   contractAddress: HexString
//   data: HexString
//   topics: HexString[]
// }

export interface ExtendedQuaiTransactionInterface extends QuaiTransaction {
  // shared field
  status: QuaiTransactionStatus

  // in case of fail
  error?: string

  // in case of confirmation
  blockHash?: string
  blockHeight?: number

  // gasUsed: bigint
  // etxs: {
  //   hash?: string
  //   to?: string
  //   from?: string
  //   nonce: number
  //   gasLimit: bigint
  //   gasPrice?: bigint
  //   maxPriorityFeePerGas?: bigint
  //   maxFeePerGas?: bigint
  //   data: string
  //   value: bigint
  //   chainId: number
  //   r?: string
  //   s?: string
  //   v?: number
  //   type?: number | null
  //   accessList?: { address: string; storageKeys: string[] }[]
  //   externalGasLimit?: bigint
  //   externalGasPrice?: bigint
  //   externalGasTip?: bigint
  //   externalData?: string
  //   externalAccessList?: { address: string; storageKeys: string[] }[]
  // }[]
  // logs: QuaiLogs[] | undefined
}
