import Dexie, { Collection, DexieOptions, IndexableTypeArray } from "dexie"
import { UNIXTime } from "../../types"
import { AccountBalance, AddressOnNetwork } from "../../accounts"
import {
  AnyEVMBlock,
  AnyEVMTransaction,
  NetworkBaseAsset,
} from "../../networks"
import { FungibleAsset } from "../../assets"
import {
  BASE_ASSETS,
  CHAIN_ID_TO_RPC_URLS,
  NETWORK_BY_CHAIN_ID,
} from "../../constants"
import { NetworkInterfaceGA } from "../../constants/networks/networkTypes"
import { NetworksArray } from "../../constants/networks/networks"

export type Transaction = AnyEVMTransaction & {
  dataSource: "local"
  firstSeen: UNIXTime
}

type AccountAssetTransferLookup = {
  addressNetwork: AddressOnNetwork
  retrievedAt: UNIXTime
  startBlock: bigint
  endBlock: bigint
}

// TODO keep track of blocks invalidated by a reorg
// TODO keep track of transaction replacement / nonce invalidation
export class ChainDatabase extends Dexie {
  /*
   * Accounts whose transaction and balances should be tracked on a particular
   * network.
   *
   * Keyed by the [address, network name, network chain ID] triplet.
   */
  private accountsToTrack!: Dexie.Table<
    AddressOnNetwork,
    [string, string, string]
  >

  /**
   * Keep track of details of asset transfers we've looked up before per
   * account.
   */
  private accountAssetTransferLookups!: Dexie.Table<
    AccountAssetTransferLookup,
    [number]
  >

  /*
   * Partial block headers cached to track reorgs and network status.
   *
   * Keyed by the [block hash, network name] pair.
   */
  private blocks!: Dexie.Table<AnyEVMBlock, [string, string]>

  /*
   * Historic and pending chain transactions relevant to tracked accounts.
   * chainTransaction is used in this context to distinguish from database
   * transactions.
   *
   * Keyed by the [transaction hash, network name] pair.
   */
  private chainTransactions!: Dexie.Table<Transaction, [string, string]>

  /*
   * Historic account balances.
   */
  private balances!: Dexie.Table<AccountBalance, number>

  private networks!: Dexie.Table<NetworkInterfaceGA, string>

  private baseAssets!: Dexie.Table<NetworkBaseAsset, string>

  private rpcUrls!: Dexie.Table<{ chainID: string; rpcUrls: string[] }, string>

  constructor(options?: DexieOptions) {
    super("tally/chain", options)
    this.version(1).stores({
      migrations: null,
      accountsToTrack:
        "&[address+network.baseAsset.name+network.chainID],address,network.family,network.chainID,network.baseAsset.name",
      accountAssetTransferLookups:
        "++id,[addressNetwork.address+addressNetwork.network.baseAsset.name+addressNetwork.network.chainID],[addressNetwork.address+addressNetwork.network.baseAsset.name+addressNetwork.network.chainID+startBlock],[addressNetwork.address+addressNetwork.network.baseAsset.name+addressNetwork.network.chainID+endBlock],addressNetwork.address,addressNetwork.network.chainID,addressNetwork.network.baseAsset.name,startBlock,endBlock",
      balances:
        "++id,address,assetAmount.amount,assetAmount.asset.symbol,network.baseAsset.name,blockHeight,retrievedAt",
      chainTransactions:
        "&[hash+network.baseAsset.name],hash,from,[from+network.baseAsset.name],to,[to+network.baseAsset.name],nonce,[nonce+from+network.baseAsset.name],blockHash,blockNumber,network.baseAsset.name,firstSeen,dataSource",
      blocks:
        "&[hash+network.baseAsset.name],[network.baseAsset.name+timestamp],hash,network.baseAsset.name,timestamp,parentHash,blockHeight,[blockHeight+network.baseAsset.name]",
      networks: "&chainID,baseAsset.name,family",
      baseAssets: "&chainID,symbol,name",
      rpcUrls: "&chainID, rpcUrls",
    })

    this.chainTransactions.hook(
      "updating",
      (modifications, _, chainTransaction) => {
        // Only these properties can be updated on a stored transaction.
        // NOTE: Currently we do NOT throw if another property modification is
        // attempted; instead, we just ignore it.
        const allowedVariants = ["blockHeight", "blockHash", "firstSeen"]

        const filteredModifications = Object.fromEntries(
          Object.entries(modifications).filter(([k]) =>
            allowedVariants.includes(k)
          )
        )

        // If there is an attempt to modify `firstSeen`, prefer the earliest
        // first seen value between the update and the existing value.
        if ("firstSeen" in filteredModifications) {
          return {
            ...filteredModifications,
            firstSeen: Math.min(
              chainTransaction.firstSeen,
              filteredModifications.firstSeen
            ),
          }
        }

        return filteredModifications
      }
    )

    // Updates saved accounts stored networks for old installs
    this.version(8).upgrade((tx) => {
      tx.table("accountsToTrack")
        .toCollection()
        .modify((account: AddressOnNetwork) => {
          Object.assign(account, {
            network: NETWORK_BY_CHAIN_ID[account.network.chainID],
          })
        })
    })
  }

  async initialize(): Promise<void> {
    await this.initializeBaseAssets()
    await this.initializeRPCs()
    await this.initializeEVMNetworks()
  }

  async getLatestBlock(
    network: NetworkInterfaceGA
  ): Promise<AnyEVMBlock | null> {
    return (
      (
        await this.blocks
          .where("[network.baseAsset.name+timestamp]")
          // Only query blocks from the last 86 seconds
          .aboveOrEqual([network.baseAsset.name, Date.now() - 60 * 60 * 24])
          .and(
            (block) => block.network.baseAsset.name === network.baseAsset.name
          )
          .reverse()
          .sortBy("timestamp")
      )[0] || null
    )
  }

  async getTransaction(
    network: NetworkInterfaceGA,
    txHash: string
  ): Promise<AnyEVMTransaction | null> {
    return (
      (
        await this.chainTransactions
          .where("[hash+network.baseAsset.name]")
          .equals([txHash, network.baseAsset.name])
          .toArray()
      )[0] || null
    )
  }

  async getAllEVMNetworks(): Promise<NetworkInterfaceGA[]> {
    return this.networks.where("family").equals("EVM").toArray()
  }

  async getEVMNetworkByChainID(
    chainID: string
  ): Promise<NetworkInterfaceGA | undefined> {
    return (await this.networks.where("family").equals("EVM").toArray()).find(
      (network) => network.chainID === chainID
    )
  }

  async getBaseAssetForNetwork(chainID: string): Promise<NetworkBaseAsset> {
    const baseAsset = await this.baseAssets.get(chainID)
    if (!baseAsset) {
      throw new Error(`No Base Asset Found For Network ${chainID}`)
    }
    return baseAsset
  }

  async initializeRPCs(): Promise<void> {
    await Promise.all(
      Object.entries(CHAIN_ID_TO_RPC_URLS).map(async ([chainId, rpcUrls]) => {
        if (rpcUrls) {
          await this.addRpcUrls(chainId, rpcUrls)
        }
      })
    )
  }

  async initializeBaseAssets(): Promise<void> {
    await this.updateBaseAssets(BASE_ASSETS)
  }

  async initializeEVMNetworks(): Promise<void> {
    const existingNetworks = await this.getAllEVMNetworks()
    await Promise.all(
      NetworksArray.map(async (defaultNetwork) => {
        if (
          !existingNetworks.some(
            (network) => network.chainID === defaultNetwork.chainID
          )
        ) {
          await this.networks.put(defaultNetwork)
        }
      })
    )
  }

  async getRpcUrlsByChainId(chainId: string): Promise<string[]> {
    const rpcUrls = await this.rpcUrls.where({ chainId }).first()
    if (rpcUrls) {
      return rpcUrls.rpcUrls
    }
    throw new Error(`No RPC Found for ${chainId}`)
  }

  private async addRpcUrls(chainID: string, rpcUrls: string[]): Promise<void> {
    const existingRpcUrlsForChain = await this.rpcUrls.get(chainID)
    if (existingRpcUrlsForChain) {
      existingRpcUrlsForChain.rpcUrls.push(...rpcUrls)
      existingRpcUrlsForChain.rpcUrls = [
        ...new Set(existingRpcUrlsForChain.rpcUrls),
      ]
      await this.rpcUrls.put(existingRpcUrlsForChain)
    } else {
      await this.rpcUrls.put({ chainID, rpcUrls })
    }
  }

  async getAllRpcUrls(): Promise<{ chainID: string; rpcUrls: string[] }[]> {
    return this.rpcUrls.toArray()
  }

  async getAllSavedTransactionHashes(): Promise<IndexableTypeArray> {
    return this.chainTransactions.orderBy("hash").keys()
  }

  async getAllTransactions(): Promise<Transaction[]> {
    return this.chainTransactions.toArray()
  }

  async getTransactionsForNetworkQuery(
    network: NetworkInterfaceGA
  ): Promise<Collection<Transaction, [string, string]>> {
    return this.chainTransactions
      .where("network.baseAsset.name")
      .equals(network.baseAsset.name)
  }

  async getTransactionsForNetwork(
    network: NetworkInterfaceGA
  ): Promise<Transaction[]> {
    return (await this.getTransactionsForNetworkQuery(network)).toArray()
  }

  /**
   * Looks up and returns all pending transactions for the given network.
   */
  async getNetworkPendingTransactions(
    network: NetworkInterfaceGA
  ): Promise<(AnyEVMTransaction & { firstSeen: UNIXTime })[]> {
    const transactions = await this.getTransactionsForNetworkQuery(network)
    return transactions
      .filter(
        (transaction) =>
          !("status" in transaction) &&
          (transaction.blockHash === null || transaction.blockHeight === null)
      )
      .toArray()
  }

  async getBlock(
    network: NetworkInterfaceGA,
    blockHash: string
  ): Promise<AnyEVMBlock | null> {
    return (
      (
        await this.blocks
          .where("[hash+network.baseAsset.name]")
          .equals([blockHash, network.baseAsset.name])
          .toArray()
      )[0] || null
    )
  }

  async addOrUpdateTransaction(
    tx: AnyEVMTransaction,
    dataSource: Transaction["dataSource"]
  ): Promise<void> {
    await this.transaction("rw", this.chainTransactions, () => {
      return this.chainTransactions.put({
        ...tx,
        firstSeen: Date.now(),
        dataSource,
      })
    })
  }

  async getLatestAccountBalance(
    address: string,
    network: NetworkInterfaceGA,
    asset: FungibleAsset
  ): Promise<AccountBalance | null> {
    // TODO this needs to be tightened up, both for performance and specificity
    const balanceCandidates = await this.balances
      .where("retrievedAt")
      .above(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .filter(
        (balance) =>
          balance.address === address &&
          balance.assetAmount.asset.symbol === asset.symbol &&
          balance.network.baseAsset.name === network.baseAsset.name
      )
      .reverse()
      .sortBy("retrievedAt")
    return balanceCandidates.length > 0 ? balanceCandidates[0] : null
  }

  async addAccountToTrack(addressNetwork: AddressOnNetwork): Promise<void> {
    await this.accountsToTrack.put(addressNetwork)
  }

  async removeAccountToTrack(address: string): Promise<void> {
    // @TODO Network Specific deletion when we support it.
    await this.accountsToTrack.where("address").equals(address).delete()
  }

  async removeActivities(address: string): Promise<void> {
    // Get all transactions
    const txs = await this.getAllTransactions()

    // Filter transactions that include the specified address in the `from` or `to` fields
    const txsToRemove = txs.filter(
      (tx) =>
        tx.from?.toLowerCase().trim() === address.toLowerCase().trim() ||
        tx.to?.toLowerCase().trim() === address.toLowerCase().trim()
    )
    // Delete each transaction by their `hash` and `network.baseAsset.name`
    for (let i = 0; i < txsToRemove.length; i + 1) {
      const tx = txsToRemove[i]
      const { hash, network } = tx

      const deleteChainTransactionsHandle = async () => {
        await this.chainTransactions
          .where(["hash", "network.baseAsset.name"])
          .equals([hash, network.baseAsset.name])
          .delete()
      }
      deleteChainTransactionsHandle()
    }
  }

  async getOldestAccountAssetTransferLookup(
    addressNetwork: AddressOnNetwork
  ): Promise<bigint | null> {
    // TODO this is inefficient, make proper use of indexing
    const lookups = await this.accountAssetTransferLookups
      .where("[addressNetwork.address+addressNetwork.network.baseAsset.name]")
      .equals([addressNetwork.address, addressNetwork.network.baseAsset.name])
      .toArray()
    return lookups.reduce(
      (oldestBlock: bigint | null, lookup) =>
        oldestBlock === null || lookup.startBlock < oldestBlock
          ? lookup.startBlock
          : oldestBlock,
      null
    )
  }

  async getNewestAccountAssetTransferLookup(
    addressNetwork: AddressOnNetwork
  ): Promise<bigint | null> {
    // TODO this is inefficient, make proper use of indexing
    const lookups = await this.accountAssetTransferLookups
      .where("[addressNetwork.address+addressNetwork.network.baseAsset.name]")
      .equals([addressNetwork.address, addressNetwork.network.baseAsset.name])

      .toArray()
    return lookups.reduce(
      (newestBlock: bigint | null, lookup) =>
        newestBlock === null || lookup.endBlock > newestBlock
          ? lookup.endBlock
          : newestBlock,
      null
    )
  }

  async recordAccountAssetTransferLookup(
    addressNetwork: AddressOnNetwork,
    startBlock: bigint,
    endBlock: bigint
  ): Promise<void> {
    await this.accountAssetTransferLookups.add({
      addressNetwork,
      startBlock,
      endBlock,
      retrievedAt: Date.now(),
    })
  }

  async addBlock(block: AnyEVMBlock): Promise<void> {
    // TODO Consider exposing whether the block was added or updated.
    // TODO Consider tracking history of block changes, e.g. in case of reorg.
    await this.blocks.put(block)
  }

  async addBalance(accountBalance: AccountBalance): Promise<void> {
    await this.balances.add(accountBalance)
  }

  async updateBaseAssets(baseAssets: NetworkBaseAsset[]): Promise<void> {
    await this.baseAssets.bulkPut(baseAssets)
  }

  async getAccountsToTrack(): Promise<AddressOnNetwork[]> {
    return this.accountsToTrack.toArray()
  }

  async getTrackedAddressesOnNetwork(
    network: NetworkInterfaceGA
  ): Promise<AddressOnNetwork[]> {
    return this.accountsToTrack
      .where("network.baseAsset.name")
      .equals(network.baseAsset.name)
      .toArray()
  }

  async getTrackedAccountOnNetwork({
    address,
    network,
  }: AddressOnNetwork): Promise<AddressOnNetwork | null> {
    return (
      (
        await this.accountsToTrack
          .where("[address+network.baseAsset.name+network.chainID]")
          .equals([address, network.baseAsset.name, network.chainID])
          .toArray()
      )[0] ?? null
    )
  }

  async getChainIDsToTrack(): Promise<Set<string>> {
    const chainIDs = await this.accountsToTrack
      .orderBy("network.chainID")
      .keys()
    return new Set(
      chainIDs.filter(
        (chainID): chainID is string => typeof chainID === "string"
      )
    )
  }
}

export function createDB(options?: DexieOptions): ChainDatabase {
  return new ChainDatabase(options)
}
