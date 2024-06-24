export interface NetworkInterfaceGA {
  chainID: string
  baseAsset: { name: string; symbol: string; decimals: number }
  family: string
  derivationPath?: string
  rpcUrls: string[] | string
}
