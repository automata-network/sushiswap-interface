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

  if (chainId === ChainId.BSC) {
    return await calculateBSCFee(chainId, address, decimals, nativeTokenAmount, 'bnb', 18)
  } else {
    throw Error('Unsupported Network')
  }
}

async function calculateBSCFee(
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
  // const priceBNB = parseFloat(price_BNB) * Math.pow(10, 18) / Math.pow(10, decimals)
  const feeInToken = new JSBigNumber(nativeTokenAmount.toString()).div(price)
  return feeInToken
}
