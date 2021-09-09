import { AddressMap, ChainId } from '@sushiswap/sdk'

export const CONVEYOR_RELAYER_URI: { [key: string]: AddressMap } = {
  production: {
    [ChainId.MAINNET]: 'https://gtoken-geode-production.ata.network:3390',
    [ChainId.BSC]: 'https://gtoken-geode-production.ata.network:3390',
    [ChainId.MATIC]: 'https://gtoken-geode-production.ata.network:3390',
  },
  staging: {
    [ChainId.MAINNET]: 'https://gtoken-geode-staging.ata.network:3390',
    [ChainId.BSC]: 'https://gtoken-geode-staging.ata.network:3390',
    [ChainId.MATIC]: 'https://gtoken-geode-staging.ata.network:3390',
  },
}
