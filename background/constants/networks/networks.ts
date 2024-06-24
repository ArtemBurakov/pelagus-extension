import { NetworkInterfaceGA } from "./networkTypes"

export const QuaiNetworkGA: NetworkInterfaceGA = {
  chainID: "9000",
  baseAsset: { name: "Quai Network", symbol: "QUAI", decimals: 18 },
  family: "EVM",
  rpcUrls: ["http://rpc.sandbox.quai.network/"],
}

export const NetworksArray = [QuaiNetworkGA]
