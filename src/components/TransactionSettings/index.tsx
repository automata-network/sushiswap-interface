import React, { useEffect, useRef, useState } from 'react'
import {
  useIsExpertMode,
  useSetUserSlippageTolerance,
  useUserConveyorUseRelay,
  useUserLiquidityGasLimit,
  useUserMaxTokenAmount,
  useUserSlippageTolerance,
  useUserSwapGasLimit,
  useUserTransactionTTL,
} from '../../state/user/hooks'

import { ADD_LIQUIDITY_GAS_LIMIT, DEFAULT_DEADLINE_FROM_NOW, SWAP_GAS_LIMIT } from '../../constants'
import { Percent } from '@sushiswap/sdk'
import QuestionHelper from '../QuestionHelper'
import Typography from '../Typography'
import { classNames } from '../../functions'
import { t } from '@lingui/macro'
import { useLingui } from '@lingui/react'
import Button from '../Button'

enum SlippageError {
  InvalidInput = 'InvalidInput',
  RiskyLow = 'RiskyLow',
  RiskyHigh = 'RiskyHigh',
}

enum DeadlineError {
  InvalidInput = 'InvalidInput',
}

enum GasLimitError {
  InvalidInput = 'InvalidInput',
}

export interface TransactionSettingsProps {
  placeholderSlippage?: Percent // varies according to the context in which the settings dialog is placed
}

export default function TransactionSettings({ placeholderSlippage }: TransactionSettingsProps) {
  const { i18n } = useLingui()

  const inputRef = useRef<HTMLInputElement>()

  const isExpertMode = useIsExpertMode()
  const userSlippageTolerance = useUserSlippageTolerance()
  const setUserSlippageTolerance = useSetUserSlippageTolerance()

  const [deadline, setDeadline] = useUserTransactionTTL()

  const [userConveyorUseRelay] = useUserConveyorUseRelay()

  const [slippageInput, setSlippageInput] = useState('')
  const [slippageError, setSlippageError] = useState<SlippageError | false>(false)

  const [deadlineInput, setDeadlineInput] = useState('')
  const [deadlineError, setDeadlineError] = useState<DeadlineError | false>(false)

  const [userSwapGasLimit, setUserSwapGasLimit] = useUserSwapGasLimit()
  const [swapGasLimitInput, setSwapGasLimitInput] = useState('')
  const [swapGasLimitError, setSwapGasLimitError] = useState<GasLimitError | false>(false)

  const [userLiquidityGasLimit, setUserLiquidityGasLimit] = useUserLiquidityGasLimit()
  const [liquidityGasLimitInput, setLiquidityGasLimitInput] = useState('')
  const [liquidityGasLimitError, setLiquidityGasLimitError] = useState<GasLimitError | false>(false)

  const [userMaxTokenAmount, setUserMaxTokenAmount] = useUserMaxTokenAmount()
  const [maxTokenAmountInput, setMaxTokenAmountInput] = useState('')

  useEffect(() => {
    if ((!isExpertMode && userConveyorUseRelay) || !userConveyorUseRelay) {
      if (userSwapGasLimit !== SWAP_GAS_LIMIT) {
        setUserSwapGasLimit(SWAP_GAS_LIMIT)
      }

      if (userLiquidityGasLimit !== ADD_LIQUIDITY_GAS_LIMIT) {
        setUserLiquidityGasLimit(ADD_LIQUIDITY_GAS_LIMIT)
      }
    }
  }, [isExpertMode, setUserLiquidityGasLimit, setUserSwapGasLimit, userConveyorUseRelay])

  function parseSlippageInput(value: string) {
    // populate what the user typed and clear the error
    setSlippageInput(value)
    setSlippageError(false)

    if (value.length === 0) {
      setUserSlippageTolerance('auto')
    } else {
      const parsed = Math.floor(Number.parseFloat(value) * 100)

      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 5000) {
        setUserSlippageTolerance('auto')
        if (value !== '.') {
          setSlippageError(SlippageError.InvalidInput)
        }
      } else {
        setUserSlippageTolerance(new Percent(parsed, 10_000))
      }
    }
  }

  const tooLow = userSlippageTolerance !== 'auto' && userSlippageTolerance.lessThan(new Percent(5, 10_000))
  const tooHigh = userSlippageTolerance !== 'auto' && userSlippageTolerance.greaterThan(new Percent(1, 100))

  function parseCustomDeadline(value: string) {
    // populate what the user typed and clear the error
    setDeadlineInput(value)
    setDeadlineError(false)

    if (value.length === 0) {
      setDeadline(DEFAULT_DEADLINE_FROM_NOW)
    } else {
      try {
        const parsed: number = Math.floor(Number.parseFloat(value) * 60)
        if (!Number.isInteger(parsed) || parsed < 60 || parsed > 180 * 60) {
          setDeadlineError(DeadlineError.InvalidInput)
        } else {
          setDeadline(parsed)
        }
      } catch (error) {
        console.error(error)
        setDeadlineError(DeadlineError.InvalidInput)
      }
    }
  }

  function parseSwapGasLimit(value: string) {
    setSwapGasLimitInput(value)
    setSwapGasLimitError(false)

    if (value.length === 0) {
      setUserSwapGasLimit(SWAP_GAS_LIMIT)
    } else {
      try {
        const parsed: number = Number.parseInt(value)
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) {
          setSwapGasLimitError(GasLimitError.InvalidInput)
        } else {
          setUserSwapGasLimit(parsed)
        }
      } catch (error) {
        console.error(error)
        setSwapGasLimitError(GasLimitError.InvalidInput)
      }
    }
  }

  function parseLiquidityGasLimit(value: string) {
    setLiquidityGasLimitInput(value)
    setLiquidityGasLimitError(false)

    if (value.length === 0) {
      setUserLiquidityGasLimit(ADD_LIQUIDITY_GAS_LIMIT)
    } else {
      try {
        const parsed: number = Number.parseInt(value)
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) {
          setLiquidityGasLimitError(GasLimitError.InvalidInput)
        } else {
          setUserLiquidityGasLimit(parsed)
        }
      } catch (error) {
        console.error(error)
        setLiquidityGasLimitError(GasLimitError.InvalidInput)
      }
    }
  }

  const parseMaxTokenAmount = (value: string) => {
    setMaxTokenAmountInput(value)

    if (value.length === 0) {
      setUserMaxTokenAmount(12000000)
    } else {
      setUserMaxTokenAmount(Number.parseInt(value))
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex items-center">
          <Typography variant="sm" className="text-high-emphesis">
            {i18n._(t`Slippage tolerance`)}
          </Typography>

          <QuestionHelper
            text={i18n._(
              t`Your transaction will revert 23if the price changes unfavorably by more than this percentage.`
            )}
          />
        </div>
        <div className="flex items-center space-x-2">
          <div
            className={classNames(
              !!slippageError
                ? 'border-red'
                : tooLow || tooHigh
                ? 'border-yellow'
                : userSlippageTolerance !== 'auto'
                ? 'border-blue'
                : 'border-transparent',
              'border p-2 rounded bg-dark-800'
            )}
            tabIndex={-1}
          >
            <div className="flex items-center justify-between gap-1">
              {tooLow || tooHigh ? (
                <span className="hidden sm:inline text-yellow" role="img" aria-label="warning">
                  ⚠️
                </span>
              ) : null}
              <input
                className={classNames(slippageError ? 'text-red' : '', 'bg-transparent placeholder-low-emphesis')}
                placeholder={placeholderSlippage?.toFixed(2)}
                value={
                  slippageInput.length > 0
                    ? slippageInput
                    : userSlippageTolerance === 'auto'
                    ? ''
                    : userSlippageTolerance.toFixed(2)
                }
                onChange={(e) => parseSlippageInput(e.target.value)}
                onBlur={() => {
                  setSlippageInput('')
                  setSlippageError(false)
                }}
                color={slippageError ? 'red' : ''}
              />
              %
            </div>
          </div>
          <Button
            size="sm"
            color={userSlippageTolerance === 'auto' ? 'blue' : 'gray'}
            variant={userSlippageTolerance === 'auto' ? 'filled' : 'outlined'}
            onClick={() => {
              parseSlippageInput('')
            }}
          >
            {i18n._(t`Auto`)}
          </Button>
        </div>
        {slippageError || tooLow || tooHigh ? (
          <Typography
            className={classNames(
              slippageError === SlippageError.InvalidInput ? 'text-red' : 'text-yellow',
              'font-medium flex items-center space-x-2'
            )}
            variant="sm"
          >
            <div>
              {slippageError === SlippageError.InvalidInput
                ? i18n._(t`Enter a valid slippage percentage`)
                : slippageError === SlippageError.RiskyLow
                ? i18n._(t`Your transaction may fail`)
                : i18n._(t`Your transaction may be frontrun`)}
            </div>
          </Typography>
        ) : null}
      </div>

      <div className="grid gap-2">
        <div className="flex items-center">
          <Typography variant="sm" className="text-high-emphesis">
            {i18n._(t`Transaction deadline`)}
          </Typography>

          <QuestionHelper text={i18n._(t`Your transaction will revert if it is pending for more than this long.`)} />
        </div>
        <div className="flex items-center">
          <div
            className="p-2 rounded bg-dark-800 min-w-[82px] max-w-[102px]"
            style={{ maxWidth: '40px', marginRight: '8px' }}
            tabIndex={-1}
          >
            <input
              className={classNames(deadlineError ? 'text-red' : '', 'bg-transparent placeholder-low-emphesis')}
              placeholder={(DEFAULT_DEADLINE_FROM_NOW / 60).toString()}
              value={
                deadlineInput.length > 0
                  ? deadlineInput
                  : deadline === DEFAULT_DEADLINE_FROM_NOW
                  ? ''
                  : (deadline / 60).toString()
              }
              onChange={(e) => parseCustomDeadline(e.target.value)}
              onBlur={() => {
                setDeadlineInput('')
                setDeadlineError(false)
              }}
              color={deadlineError ? 'red' : ''}
            />
          </div>
          <Typography variant="sm">{i18n._(t`minutes`)}</Typography>
        </div>
      </div>

      {/* DEBUG PURPOSE ONLY */}
      <div className="grid gap-2">
        <div className="flex items-center">
          <Typography variant="sm" className="text-high-emphesis">
            {i18n._(t`maxTokenAmount`)}
          </Typography>
        </div>
        <div className="flex items-center">
          <div className="p-2 rounded bg-dark-800" tabIndex={-1}>
            <input
              className={classNames('bg-transparent placeholder-low-emphesis')}
              placeholder={userMaxTokenAmount.toString()}
              value={
                maxTokenAmountInput.length > 0
                  ? maxTokenAmountInput
                  : userMaxTokenAmount === 12000000
                  ? ''
                  : userMaxTokenAmount.toString()
              }
              onChange={(e) => parseMaxTokenAmount(e.target.value)}
              onBlur={() => {
                setMaxTokenAmountInput('')
              }}
            />
          </div>
        </div>
      </div>

      {isExpertMode && userConveyorUseRelay && (
        <>
          <div className="grid gap-2">
            <div className="flex items-center">
              <Typography variant="sm" className="text-high-emphesis">
                {i18n._(t`Swap gas limit`)}
              </Typography>

              <QuestionHelper
                text={i18n._(
                  t`Gas limit for Swap operation. Your transaction will revert if the limitation is not enough.`
                )}
              />
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={classNames(
                  !!swapGasLimitError
                    ? 'border-red'
                    : userSwapGasLimit !== SWAP_GAS_LIMIT
                    ? 'border-blue'
                    : 'border-transparent',
                  'border p-2 rounded bg-dark-800'
                )}
                tabIndex={-1}
                style={{ flexGrow: 1 }}
              >
                <div className="flex items-center justify-between gap-1">
                  {/* {tooLow || tooHigh ? (
                    <span className="hidden sm:inline text-yellow" role="img" aria-label="warning">
                      ⚠️
                    </span>
                  ) : null} */}
                  <input
                    className={classNames(
                      swapGasLimitError ? 'text-red' : '',
                      'bg-transparent placeholder-low-emphesis'
                    )}
                    placeholder={userSwapGasLimit.toString()}
                    value={
                      swapGasLimitInput.length > 0
                        ? swapGasLimitInput
                        : userSwapGasLimit === SWAP_GAS_LIMIT
                        ? ''
                        : userSwapGasLimit.toString()
                    }
                    onChange={(e) => parseSwapGasLimit(e.target.value)}
                    onBlur={() => {
                      setSwapGasLimitInput('')
                      setSwapGasLimitError(false)
                    }}
                    color={swapGasLimitError ? 'red' : ''}
                  />
                </div>
              </div>
              <Button
                size="sm"
                color={userSwapGasLimit === SWAP_GAS_LIMIT ? 'blue' : 'gray'}
                variant={userSwapGasLimit === SWAP_GAS_LIMIT ? 'filled' : 'outlined'}
                onClick={() => {
                  parseSwapGasLimit('')
                }}
                style={{ maxWidth: 73 }}
              >
                {i18n._(t`Auto`)}
              </Button>
            </div>
            {swapGasLimitError ? (
              <Typography
                className={classNames(
                  swapGasLimitError === GasLimitError.InvalidInput ? 'text-red' : 'text-yellow',
                  'font-medium flex items-center space-x-2'
                )}
                variant="sm"
              >
                <div>{i18n._(t`Enter a valid gas number`)}</div>
              </Typography>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center">
              <Typography variant="sm" className="text-high-emphesis">
                {i18n._(t`Liquidity gas limit`)}
              </Typography>

              <QuestionHelper
                text={i18n._(
                  t`Gas limit for Liquidity operation, applied on add and remove. Your transaction will revert if the limitation is not enough.`
                )}
              />
            </div>
            <div className="flex items-center space-x-2">
              <div
                className={classNames(
                  !!liquidityGasLimitError
                    ? 'border-red'
                    : userLiquidityGasLimit !== ADD_LIQUIDITY_GAS_LIMIT
                    ? 'border-blue'
                    : 'border-transparent',
                  'border p-2 rounded bg-dark-800'
                )}
                tabIndex={-1}
                style={{ flexGrow: 1 }}
              >
                <div className="flex items-center justify-between gap-1">
                  {/* {tooLow || tooHigh ? (
                    <span className="hidden sm:inline text-yellow" role="img" aria-label="warning">
                      ⚠️
                    </span>
                  ) : null} */}
                  <input
                    className={classNames(
                      liquidityGasLimitError ? 'text-red' : '',
                      'bg-transparent placeholder-low-emphesis'
                    )}
                    placeholder={userLiquidityGasLimit.toString()}
                    value={
                      liquidityGasLimitInput.length > 0
                        ? liquidityGasLimitInput
                        : userLiquidityGasLimit === ADD_LIQUIDITY_GAS_LIMIT
                        ? ''
                        : userLiquidityGasLimit.toString()
                    }
                    onChange={(e) => parseLiquidityGasLimit(e.target.value)}
                    onBlur={() => {
                      setLiquidityGasLimitInput('')
                      setLiquidityGasLimitError(false)
                    }}
                    color={liquidityGasLimitError ? 'red' : ''}
                  />
                </div>
              </div>
              <Button
                size="sm"
                color={userLiquidityGasLimit === ADD_LIQUIDITY_GAS_LIMIT ? 'blue' : 'gray'}
                variant={userLiquidityGasLimit === ADD_LIQUIDITY_GAS_LIMIT ? 'filled' : 'outlined'}
                onClick={() => {
                  parseLiquidityGasLimit('')
                }}
                style={{ maxWidth: 73 }}
              >
                {i18n._(t`Auto`)}
              </Button>
            </div>
            {liquidityGasLimitError ? (
              <Typography
                className={classNames(
                  liquidityGasLimitError === GasLimitError.InvalidInput ? 'text-red' : 'text-yellow',
                  'font-medium flex items-center space-x-2'
                )}
                variant="sm"
              >
                <div>{i18n._(t`Enter a valid gas number`)}</div>
              </Typography>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
