import { Currency, CurrencyAmount, Percent, Trade, TradeType } from '@sushiswap/sdk'
import { Field } from '../../state/swap/actions'

/**
 * Parse currency amount object into the raw amount in string
 * @param amount Currency amount
 * @returns Raw amount
 */
export const toRawAmount = (amount: CurrencyAmount<Currency>): string => {
  const format = {
    decimalSeparator: '',
    groupSeparator: '',
  }
  const { decimals } = amount.currency

  return amount.toFixed(decimals, format)
}

// const basisPointsToPercent = (num: number): Percent => {
//   return new Percent(JSBI.BigInt(num), JSBI.BigInt(10000))
// }

export const computeSlippageAdjustedAmounts = (
  trade: Trade<Currency, Currency, TradeType> | undefined,
  allowedSlippage: Percent
): { [field in Field]?: CurrencyAmount<Currency> } => {
  const percentage = allowedSlippage
  return {
    [Field.INPUT]: trade?.maximumAmountIn(percentage),
    [Field.OUTPUT]: trade?.minimumAmountOut(percentage),
  }
}
