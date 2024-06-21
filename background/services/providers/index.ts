import { JsonRpcProvider } from "quais"

export default class PelagusJsonRpcProvider extends JsonRpcProvider {
  rpcUrls: string | string[]

  constructor(rpcUrls: string[] | string) {
    super(rpcUrls)
  }
}
