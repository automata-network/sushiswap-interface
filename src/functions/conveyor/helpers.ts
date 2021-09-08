import { Currency, CurrencyAmount } from '@sushiswap/sdk'

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
