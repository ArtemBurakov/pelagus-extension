import {
  JsonRpcSigner,
  TransactionRequest,
  TransactionResponse,
  Web3Provider,
} from "@ethersproject/providers"
import { Deferrable } from "./types"
import { toHexChainID, EVMNetwork } from "./networks"
import { TransactionAnnotation } from "./services/enrichment"

interface PelagusInternalJsonRpcSigner extends JsonRpcSigner {
  sendTransaction(
    transaction: Deferrable<
      TransactionRequest & { annotation?: TransactionAnnotation }
    >
  ): Promise<TransactionResponse>
}

export default class PelagusWeb3Provider extends Web3Provider {
  switchChain(network: EVMNetwork): Promise<unknown> {
    return this.send("wallet_switchEthereumChain", [
      {
        chainId: toHexChainID(network.chainID),
      },
    ])
  }

  override getSigner(
    addressOrIndex?: string | number
  ): PelagusInternalJsonRpcSigner {
    return super.getSigner(addressOrIndex)
  }
}
