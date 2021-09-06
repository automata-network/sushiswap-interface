import { ChainId } from '@sushiswap/sdk'
import { BigNumber } from '@ethersproject/bignumber'
import { BigNumber as JSBigNumber } from 'bignumber.js'
import { PRICE_API_PREFIX } from '../constants'

export async function calculateConveyorFeeOnToken(
  chainId: ChainId | undefined,
  address: string | undefined,
  decimals: number,
  nativeTokenAmount: BigNumber | undefined
): Promise<JSBigNumber> {
  if (chainId === undefined) {
    throw Error('Please connect to networks')
  }
  if (nativeTokenAmount === undefined) {
    throw Error('Fee on native token unknown')
  }
  if (address === undefined) {
    throw Error('Token address unknown')
  }

  // console.log({ chainId, address, decimals, nativeTokenAmount })

  if (chainId === ChainId.MAINNET) {
    return await calculateFee(chainId, address, decimals, nativeTokenAmount, 'eth', 18)
  } else if (chainId === ChainId.BSC) {
    return await calculateFee(chainId, address, decimals, nativeTokenAmount, 'bnb', 18)
  } else if (chainId === ChainId.MATIC) {
    return await calculatePolygonFee(chainId, address, decimals, nativeTokenAmount)
  } else {
    throw Error('Unsupported Network')
  }
}

async function calculateFee(
  chainId: ChainId,
  address: string,
  decimals: number,
  nativeTokenAmount: BigNumber,
  baseCurrency: string,
  baseCurrencyDecimal: number
): Promise<JSBigNumber> {
  const priceApiPrefix = PRICE_API_PREFIX[chainId]
  if (priceApiPrefix === undefined) {
    throw Error('Unable to calculate fee')
  }

  console.log('fetch', priceApiPrefix + 'contract_addresses=' + address + '&vs_currencies=' + baseCurrency)
  const response = await fetch(priceApiPrefix + 'contract_addresses=' + address + '&vs_currencies=' + baseCurrency)
  const responseMap = await response.json()
  const data = responseMap[address.toLowerCase()]
  var baseRatio
  if (baseCurrency === 'bnb') {
    const { bnb } = data
    baseRatio = bnb
  } else if (baseCurrency === 'eth') {
    const { eth } = data
    baseRatio = eth
  }
  const price = new JSBigNumber(baseRatio)
    .multipliedBy(new JSBigNumber(10).pow(baseCurrencyDecimal))
    .div(new JSBigNumber(10).pow(decimals))
  // console.log(
  //   'price',
  //   price.toFormat(decimals, {
  //     decimalSeparator: '',
  //     groupSeparator: '',
  //   })
  // )
  // const priceBNB = parseFloat(price_BNB) * Math.pow(10, 18) / Math.pow(10, decimals)
  const feeInToken = new JSBigNumber(nativeTokenAmount.toString()).div(price)
  // console.log(
  //   'price',
  //   feeInToken.toFormat(decimals, {
  //     decimalSeparator: '',
  //     groupSeparator: '',
  //   })
  // )
  return feeInToken
}

async function calculatePolygonFee(
  chainId: ChainId,
  address: string,
  decimals: number,
  nativeTokenAmount: BigNumber
): Promise<JSBigNumber> {
  const priceApiPrefix = PRICE_API_PREFIX[chainId]
  if (priceApiPrefix === undefined) {
    throw Error('Unable to calculate fee')
  }

  console.log(priceApiPrefix + 'contract_addresses=' + address + '&vs_currencies=eth')

  const response = await fetch(priceApiPrefix + 'contract_addresses=' + address + '&vs_currencies=eth')
  const responseMap = await response.json()
  const data = responseMap[address.toLowerCase()]
  const { eth } = data
  const priceBNB = new JSBigNumber(eth).multipliedBy(new JSBigNumber(10).pow(18)).div(new JSBigNumber(10).pow(decimals))

  const maticBnbRatioApi = 'https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=eth'
  const maticResponse = await fetch(maticBnbRatioApi)
  const maticResponseMap = await maticResponse.json()
  const maticData = maticResponseMap['matic-network']
  const maticBnb = maticData['eth']
  const maticBnbPrice = new JSBigNumber(maticBnb)

  // const priceBNB = parseFloat(price_BNB) * Math.pow(10, 18) / Math.pow(10, decimals)
  const feeInToken = new JSBigNumber(nativeTokenAmount.toString()).div(priceBNB.div(maticBnbPrice))
  return feeInToken
}
