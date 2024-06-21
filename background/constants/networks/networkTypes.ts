export interface QuaiNetworkInterfaceGA {
  chainID: string
  baseAsset: { name: string; symbol: string; decimals: number }
  rpcUrls: string[] | string
}
