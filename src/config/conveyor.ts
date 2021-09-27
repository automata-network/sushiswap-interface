import { AddressMap, ChainId } from '@sushiswap/sdk'

export const CONVEYOR_RELAYER_URI: { [key: string]: AddressMap } = {
  production: {
    [ChainId.MAINNET]: 'https://conveyor-prod-eth.ata.network:443',
    [ChainId.BSC]: 'https://gtoken-geode-production.ata.network:443',
    [ChainId.MATIC]: 'https://conveyor-prod-matic.ata.network:443',
  },
  staging: {
    [ChainId.MAINNET]: 'https://gtoken-geode-staging.ata.network:443',
    [ChainId.BSC]: 'https://gtoken-geode-staging.ata.network:443',
    [ChainId.MATIC]: 'https://gtoken-geode-staging.ata.network:443',
  },
}
