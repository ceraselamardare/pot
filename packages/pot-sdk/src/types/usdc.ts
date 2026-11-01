// NEP-141 / NEP-145 shapes of the test USDC (near-examples/FT@7721a49, 6 decimals) and any FT.

export interface FtMetadata {
  spec: string
  name: string
  symbol: string
  icon?: string | null
  reference?: string | null
  reference_hash?: string | null
  decimals: number
}

/** storage_balance_of: null means unregistered. Amounts are yocto. */
export interface StorageBalance {
  total: bigint
  available: bigint
}

export interface RawStorageBalance {
  total: string
  available: string
}

/** NEP-141 `storage_balance_bounds().min` for the test token: 0.00125 NEAR. */
export const USDC_STORAGE_DEPOSIT_YOCTO = 1_250_000_000_000_000_000_000n
