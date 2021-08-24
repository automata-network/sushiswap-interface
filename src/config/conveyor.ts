import { ChainId } from '@sushiswap/sdk'

export const CONVEYOR_RELAYER_URI: { [chainId in ChainId]?: string } = {
  [ChainId.BSC]: 'https://gtoken-geode-staging.ata.network:3390',
  [ChainId.BSC_TESTNET]: 'https://gtoken-geode-staging.ata.network:3390',
  [ChainId.MATIC]: 'https://gtoken-geode-staging.ata.network:3390',
  [ChainId.MAINNET]: 'https://gtoken-geode-staging.ata.network:3390',
}
