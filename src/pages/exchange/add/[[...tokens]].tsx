import { ApprovalState, useApproveCallback } from '../../../hooks/useApproveCallback'
import { AutoRow, RowBetween } from '../../../components/Row'
import Button, { ButtonError } from '../../../components/Button'
import { Currency, CurrencyAmount, Percent, WNATIVE, currencyEquals } from '@sushiswap/sdk'
import { ONE_BIPS, ZERO_PERCENT, CREATE_PAIR_GAS_LIMIT, ADD_LIQUIDITY_GAS_LIMIT } from '../../../constants'
import React, { useCallback, useEffect, useState } from 'react'
import TransactionConfirmationModal, { ConfirmationModalContent } from '../../../modals/TransactionConfirmationModal'
import { calculateGasMargin, calculateSlippageAmount } from '../../../functions/trade'
import { currencyId, maxAmountSpend } from '../../../functions/currency'
import { useDerivedMintInfo, useMintActionHandlers, useMintState } from '../../../state/mint/hooks'
import {
  useExpertModeManager,
  useUserConveyorGasEstimation,
  useUserConveyorUseRelay,
  useUserSlippageToleranceWithDefault,
} from '../../../state/user/hooks'

import Alert from '../../../components/Alert'
import { AutoColumn } from '../../../components/Column'
import { BigNumber } from '@ethersproject/bignumber'
import { ConfirmAddModalBottom } from '../../../features/exchange-v1/liquidity/ConfirmAddModalBottom'
import Container from '../../../components/Container'
import CurrencyInputPanel from '../../../components/CurrencyInputPanel'
import CurrencyLogo from '../../../components/CurrencyLogo'
import Dots from '../../../components/Dots'
import DoubleCurrencyLogo from '../../../components/DoubleLogo'
import DoubleGlowShadow from '../../../components/DoubleGlowShadow'
import ExchangeHeader from '../../../features/trade/Header'
import { Field } from '../../../state/mint/actions'
import Head from 'next/head'
import LiquidityHeader from '../../../features/exchange-v1/liquidity/LiquidityHeader'
import LiquidityPrice from '../../../features/exchange-v1/liquidity/LiquidityPrice'
import { MinimalPositionCard } from '../../../components/PositionCard'
import NavLink from '../../../components/NavLink'
import { PairState } from '../../../hooks/useV2Pairs'
import { Plus } from 'react-feather'
import ReactGA from 'react-ga'
import { TransactionResponse } from '@ethersproject/providers'
import Typography from '../../../components/Typography'
import UnsupportedCurrencyFooter from '../../../features/exchange-v1/swap/UnsupportedCurrencyFooter'
import Web3Connect from '../../../components/Web3Connect'
import { t } from '@lingui/macro'
import { useActiveWeb3React } from '../../../hooks/useActiveWeb3React'
import { useCurrency } from '../../../hooks/Tokens'
import { useIsSwapUnsupported } from '../../../hooks/useIsSwapUnsupported'
import { useLingui } from '@lingui/react'
import { useRouter } from 'next/router'
import { useConveyorRouterContract, useRouterContract } from '../../../hooks'
import { useTransactionAdder } from '../../../state/transactions/hooks'
import useTransactionDeadline from '../../../hooks/useTransactionDeadline'
import { useWalletModalToggle } from '../../../state/application/hooks'
import { CONVEYOR_V2_ROUTER_ADDRESS } from '../../../constants/abis/conveyor-v2'
import { calculateConveyorFeeOnToken } from '../../../functions/conveyorFee'
import { splitSignature } from '@ethersproject/bytes'
import { CONVEYOR_RELAYER_URI } from '../../../config/conveyor'
import ConveyorGasFee from '../../../features/trade/ConveyorGasFee'
import { BigNumber as JSBigNumber } from 'bignumber.js'

const DEFAULT_ADD_V2_SLIPPAGE_TOLERANCE = new Percent(50, 10_000)

export default function Add() {
  const { i18n } = useLingui()
  const { account, chainId, library } = useActiveWeb3React()
  const router = useRouter()
  const tokens = router.query.tokens
  const [currencyIdA, currencyIdB] = (tokens as string[]) || [undefined, undefined]

  const currencyA = useCurrency(currencyIdA)
  const currencyB = useCurrency(currencyIdB)

  const oneCurrencyIsWETH = Boolean(
    chainId &&
      ((currencyA && currencyEquals(currencyA, WNATIVE[chainId])) ||
        (currencyB && currencyEquals(currencyB, WNATIVE[chainId])))
  )

  const toggleWalletModal = useWalletModalToggle() // toggle wallet when disconnected

  const [isExpertMode] = useExpertModeManager()

  // mint state
  const { independentField, typedValue, otherTypedValue } = useMintState()
  const {
    dependentField,
    currencies,
    pair,
    pairState,
    currencyBalances,
    parsedAmounts,
    price,
    noLiquidity,
    liquidityMinted,
    poolTokenPercentage,
    error,
  } = useDerivedMintInfo(currencyA ?? undefined, currencyB ?? undefined)

  const { onFieldAInput, onFieldBInput } = useMintActionHandlers(noLiquidity)

  const isValid = !error

  // modal and loading
  const [showConfirm, setShowConfirm] = useState<boolean>(false)
  const [attemptingTxn, setAttemptingTxn] = useState<boolean>(false) // clicked confirm

  // txn values
  const deadline = useTransactionDeadline() // custom from users settings

  // const [allowedSlippage] = useUserSlippageTolerance(); // custom from users

  const allowedSlippage = useUserSlippageToleranceWithDefault(DEFAULT_ADD_V2_SLIPPAGE_TOLERANCE) // custom from users

  const [txHash, setTxHash] = useState<string>('')

  // get formatted amounts
  const formattedAmounts = {
    [independentField]: typedValue,
    [dependentField]: noLiquidity ? otherTypedValue : parsedAmounts[dependentField]?.toSignificant(6) ?? '',
  }

  // get the max amounts user can add
  const maxAmounts: { [field in Field]?: CurrencyAmount<Currency> } = [Field.CURRENCY_A, Field.CURRENCY_B].reduce(
    (accumulator, field) => {
      return {
        ...accumulator,
        [field]: maxAmountSpend(currencyBalances[field]),
      }
    },
    {}
  )

  const atMaxAmounts: { [field in Field]?: CurrencyAmount<Currency> } = [Field.CURRENCY_A, Field.CURRENCY_B].reduce(
    (accumulator, field) => {
      return {
        ...accumulator,
        [field]: maxAmounts[field]?.equalTo(parsedAmounts[field] ?? '0'),
      }
    },
    {}
  )

  const [userConveyorUseRelay] = useUserConveyorUseRelay()

  const routerContract = useRouterContract()

  const conveyorRouterContract = useConveyorRouterContract()

  // check whether the user has approved the router on the tokens
  const [approvalA, approveACallback] = useApproveCallback(
    parsedAmounts[Field.CURRENCY_A],
    !userConveyorUseRelay ? routerContract?.address : CONVEYOR_V2_ROUTER_ADDRESS[chainId]
  )
  const [approvalB, approveBCallback] = useApproveCallback(
    parsedAmounts[Field.CURRENCY_B],
    !userConveyorUseRelay ? routerContract?.address : CONVEYOR_V2_ROUTER_ADDRESS[chainId]
  )

  const addTransaction = useTransactionAdder()

  async function onAdd() {
    if (!chainId || !library || !account || !routerContract) return

    const { [Field.CURRENCY_A]: parsedAmountA, [Field.CURRENCY_B]: parsedAmountB } = parsedAmounts

    // console.log({ parsedAmountA, parsedAmountB, currencyA, currencyB, deadline })

    if (!parsedAmountA || !parsedAmountB || !currencyA || !currencyB || !deadline) {
      return
    }

    const amountsMin = {
      [Field.CURRENCY_A]: calculateSlippageAmount(parsedAmountA, noLiquidity ? ZERO_PERCENT : allowedSlippage)[0],
      [Field.CURRENCY_B]: calculateSlippageAmount(parsedAmountB, noLiquidity ? ZERO_PERCENT : allowedSlippage)[0],
    }

    // console.log('userConveyorUseRelay: ', userConveyorUseRelay)

    if (!userConveyorUseRelay) {
      // Sushiswap's default add
      let estimate,
        method: (...args: any) => Promise<TransactionResponse>,
        args: Array<string | string[] | number>,
        value: BigNumber | null
      if (currencyA.isNative || currencyB.isNative) {
        const tokenBIsETH = currencyB.isNative
        estimate = routerContract.estimateGas.addLiquidityETH
        method = routerContract.addLiquidityETH
        args = [
          (tokenBIsETH ? currencyA : currencyB)?.wrapped?.address ?? '', // token
          (tokenBIsETH ? parsedAmountA : parsedAmountB).quotient.toString(), // token desired
          amountsMin[tokenBIsETH ? Field.CURRENCY_A : Field.CURRENCY_B].toString(), // token min
          amountsMin[tokenBIsETH ? Field.CURRENCY_B : Field.CURRENCY_A].toString(), // eth min
          account,
          deadline.toHexString(),
        ]
        value = BigNumber.from((tokenBIsETH ? parsedAmountB : parsedAmountA).quotient.toString())
      } else {
        estimate = routerContract.estimateGas.addLiquidity
        method = routerContract.addLiquidity
        args = [
          currencyA?.wrapped?.address ?? '',
          currencyB?.wrapped?.address ?? '',
          parsedAmountA.quotient.toString(),
          parsedAmountB.quotient.toString(),
          amountsMin[Field.CURRENCY_A].toString(),
          amountsMin[Field.CURRENCY_B].toString(),
          account,
          deadline.toHexString(),
        ]
        value = null
      }

      setAttemptingTxn(true)
      await estimate(...args, value ? { value } : {})
        .then((estimatedGasLimit) =>
          method(...args, {
            ...(value ? { value } : {}),
            gasLimit: calculateGasMargin(estimatedGasLimit),
          }).then((response) => {
            setAttemptingTxn(false)

            addTransaction(response, {
              summary: i18n._(
                t`Add ${parsedAmounts[Field.CURRENCY_A]?.toSignificant(3)} ${
                  currencies[Field.CURRENCY_A]?.symbol
                } and ${parsedAmounts[Field.CURRENCY_B]?.toSignificant(3)} ${currencies[Field.CURRENCY_B]?.symbol}`
              ),
            })

            setTxHash(response.hash)

            ReactGA.event({
              category: 'Liquidity',
              action: 'Add',
              label: [currencies[Field.CURRENCY_A]?.symbol, currencies[Field.CURRENCY_B]?.symbol].join('/'),
            })
          })
        )
        .catch((error) => {
          setAttemptingTxn(false)
          // we only care if the error is something _other_ than the user rejected the tx
          if (error?.code !== 4001) {
            console.error(error)
          }
        })
    } else {
      // Use ConveyorV2 relay for add
      const nonce: BigNumber = await conveyorRouterContract.nonces(account)

      const { [Field.CURRENCY_A]: parsedAmountA, [Field.CURRENCY_B]: parsedAmountB } = parsedAmounts
      if (!parsedAmountA || !parsedAmountB || !currencyA || !currencyB || !deadline) {
        return
      }

      const amountADesired = parsedAmountA.toFixed(parsedAmountA.currency.decimals, {
        decimalSeparator: '',
        groupSeparator: '',
      })
      const amountBDesired = parsedAmountB.toFixed(parsedAmountB.currency.decimals, {
        decimalSeparator: '',
        groupSeparator: '',
      })
      const amountAMin = amountsMin[Field.CURRENCY_A].toString()
      const amountBMin = amountsMin[Field.CURRENCY_B].toString()
      // console.log('amountAMin: ', amountAMin)
      // console.log('amountBMin: ', amountBMin)

      // if (currencyA === ETHER || currencyB === ETHER) {
      //   setErrorMessage('Only GToken is supported')
      //   return
      // }

      const gasPrice = await library?.getGasPrice()
      const gasLimit = pairState === PairState.NOT_EXISTS ? CREATE_PAIR_GAS_LIMIT : ADD_LIQUIDITY_GAS_LIMIT
      const feeOnTokenA = await calculateConveyorFeeOnToken(
        chainId,
        currencyIdA,
        currencyA.decimals,
        gasPrice === undefined ? undefined : gasPrice.mul(gasLimit)
      )

      const EIP712Domain = [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ]

      const AddLiquidity = [
        { name: 'tokenA', type: 'address' },
        { name: 'tokenB', type: 'address' },
        { name: 'amountADesired', type: 'uint256' },
        { name: 'amountBDesired', type: 'uint256' },
        { name: 'amountAMin', type: 'uint256' },
        { name: 'amountBMin', type: 'uint256' },
        { name: 'user', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'feeAmount', type: 'uint256' },
        { name: 'feeToken', type: 'address' },
      ]

      const domain = {
        name: 'ConveyorV2',
        version: '1',
        chainId: BigNumber.from(chainId).toHexString(),
        verifyingContract: CONVEYOR_V2_ROUTER_ADDRESS[chainId],
      }

      // console.log('parsedAmounts:', { parsedAmountA, parsedAmountB })
      // console.log('formattedParsedAmounts:', {
      //   parsedAmountA: parsedAmountA.toFixed(18, { decimalSeparator: '', groupSeparator: '' }),
      //   parsedAmountB: parsedAmountB.toFixed(18, { decimalSeparator: '', groupSeparator: '' }),
      // })
      // console.log('parsedAmounts:', { parsedAmountA, parsedAmountB })
      // console.log('amountsMin:', [amountsMin[Field.CURRENCY_A].toString(), amountsMin[Field.CURRENCY_B].toString()])

      const message = {
        tokenA: currencyIdA,
        tokenB: currencyIdB,
        amountADesired: BigNumber.from(amountADesired).toHexString(),
        amountBDesired: BigNumber.from(amountBDesired).toHexString(),
        amountAMin: BigNumber.from(amountAMin).toHexString(),
        amountBMin: BigNumber.from(amountBMin).toHexString(),
        user: account,
        nonce: nonce.toHexString(),
        deadline: deadline.toHexString(),
        feeAmount: BigNumber.from(feeOnTokenA.toFixed(0)).toHexString(),
        feeToken: currencyIdA,
      }

      const EIP712Msg = {
        types: {
          EIP712Domain,
          AddLiquidity,
        },
        domain,
        primaryType: 'AddLiquidity',
        message,
      }

      const data = JSON.stringify(EIP712Msg)
      setAttemptingTxn(true)
      const signature = await library.send('eth_signTypedData_v4', [account, data])
      const { v, r, s } = splitSignature(signature)

      const params = [chainId, EIP712Msg, v.toString(), r, s]
      // console.log('params: ', params)

      const jsonrpcRequest = {
        jsonrpc: '2.0',
        method: '/v2/addLiquidity',
        id: 1,
        params,
      }

      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jsonrpcRequest),
      }
      // console.log(jsonrpcRequest)
      // const environment = process.env.REACT_APP_ENVIRONMENT ? process.env.REACT_APP_ENVIRONMENT : 'staging'
      const jsonrpcResponse = await fetch(CONVEYOR_RELAYER_URI[chainId]!, requestOptions)

      const { result: response } = await jsonrpcResponse.json()

      setAttemptingTxn(false)

      if (response.success === true) {
        addTransaction(
          { hash: response.txnHash },
          {
            summary:
              'Add ' +
              parsedAmounts[Field.CURRENCY_A]?.toSignificant(3) +
              ' ' +
              currencies[Field.CURRENCY_A]?.symbol +
              ' and ' +
              parsedAmounts[Field.CURRENCY_B]?.toSignificant(3) +
              ' ' +
              currencies[Field.CURRENCY_B]?.symbol,
          }
        )

        setTxHash(response.txnHash)
      } else {
        throw new Error(response.errorMessage)
      }
    }
  }

  const modalHeader = () => {
    return noLiquidity ? (
      <div className="pb-4">
        <div className="flex items-center justify-start gap-3">
          <div className="text-2xl font-bold text-high-emphesis">
            {currencies[Field.CURRENCY_A]?.symbol + '/' + currencies[Field.CURRENCY_B]?.symbol}
          </div>
          <DoubleCurrencyLogo currency0={currencyA} currency1={currencyB} size={48} />
        </div>
      </div>
    ) : (
      <div className="pb-4">
        <div className="flex items-center justify-start gap-3">
          <div className="text-xl font-bold md:text-3xl text-high-emphesis">{liquidityMinted?.toSignificant(6)}</div>
          <div className="grid grid-flow-col gap-2">
            <DoubleCurrencyLogo currency0={currencyA} currency1={currencyB} size={48} />
          </div>
        </div>
        <div className="text-lg font-medium md:text-2xl text-high-emphesis">
          {currencies[Field.CURRENCY_A]?.symbol}/{currencies[Field.CURRENCY_B]?.symbol}
          &nbsp;{i18n._(t`Pool Tokens`)}
        </div>
        <div className="pt-3 text-xs italic text-secondary">
          {i18n._(t`Output is estimated. If the price changes by more than ${allowedSlippage.toSignificant(
            4
          )}% your transaction
            will revert.`)}
        </div>
      </div>
    )
  }

  const modalBottom = () => {
    return (
      <ConfirmAddModalBottom
        price={price}
        currencies={currencies}
        parsedAmounts={parsedAmounts}
        noLiquidity={noLiquidity}
        onAdd={onAdd}
        poolTokenPercentage={poolTokenPercentage}
      />
    )
  }

  const pendingText = i18n._(
    t`Supplying ${parsedAmounts[Field.CURRENCY_A]?.toSignificant(6)} ${
      currencies[Field.CURRENCY_A]?.symbol
    } and ${parsedAmounts[Field.CURRENCY_B]?.toSignificant(6)} ${currencies[Field.CURRENCY_B]?.symbol}`
  )

  const handleCurrencyASelect = useCallback(
    (currencyA: Currency) => {
      const newCurrencyIdA = currencyId(currencyA)
      if (newCurrencyIdA === currencyIdB) {
        router.push(`/add/${currencyIdB}/${currencyIdA}`)
      } else {
        router.push(`/add/${newCurrencyIdA}/${currencyIdB}`)
      }
    },
    [currencyIdB, router, currencyIdA]
  )
  const handleCurrencyBSelect = useCallback(
    (currencyB: Currency) => {
      const newCurrencyIdB = currencyId(currencyB)
      if (currencyIdA === newCurrencyIdB) {
        if (currencyIdB) {
          router.push(`/add/${currencyIdB}/${newCurrencyIdB}`)
        } else {
          router.push(`/add/${newCurrencyIdB}`)
        }
      } else {
        router.push(`/add/${currencyIdA ? currencyIdA : 'ETH'}/${newCurrencyIdB}`)
      }
    },
    [currencyIdA, router, currencyIdB]
  )

  const handleDismissConfirmation = useCallback(() => {
    setShowConfirm(false)
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onFieldAInput('')
    }
    setTxHash('')
  }, [onFieldAInput, txHash])

  const addIsUnsupported = useIsSwapUnsupported(currencies?.CURRENCY_A, currencies?.CURRENCY_B)

  // console.log(
  //   { addIsUnsupported, isValid, approvalA, approvalB },
  //   approvalA === ApprovalState.APPROVED && approvalB === ApprovalState.APPROVED
  // )

  // Conveyor gas fee estimation
  const [conveyorGasEstimation, setConveyorGasEstimation] = useState<string | undefined>(undefined)
  const [userConveyorGasEstimation] = useUserConveyorGasEstimation()
  useEffect(() => {
    ;(() => {
      if (!userConveyorUseRelay) return
      if (userConveyorGasEstimation === '') return
      if (typeof currencyA === 'undefined') return

      const gasEstimation = new JSBigNumber(userConveyorGasEstimation).div(
        new JSBigNumber(10).pow(currencyA!.decimals).toString()
      )

      setConveyorGasEstimation(gasEstimation.toString())
    })()
  }, [userConveyorUseRelay, currencyA, userConveyorGasEstimation])

  return (
    <>
      <Head>
        <title>Add Liquidity | Sushi</title>
        <meta
          key="description"
          name="description"
          content="Add liquidity to the SushiSwap AMM to enable gas optimised and low slippage trades across countless networks"
        />
      </Head>

      <Container id="add-liquidity-page" className="py-4 space-y-6 md:py-8 lg:py-12" maxWidth="2xl">
        <div className="flex items-center justify-between px-4 mb-5">
          <NavLink href="/pool">
            <a className="flex items-center space-x-2 text-base font-medium text-center cursor-pointer text-secondary hover:text-high-emphesis">
              <span>{i18n._(t`View Liquidity Positions`)}</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </NavLink>
          {/* <button
            style={{
              backgroundColor: 'rgba(167, 85, 221, 0.25)',
              border: '1px solid #A755DD',
              borderRadius: 20,
              padding: '5px 40px',
              fontSize: 14,
            }}
          >
            FARM THE {currencies[Field.CURRENCY_A]?.symbol}-{currencies[Field.CURRENCY_B]?.symbol} POOL
          </button> */}
        </div>

        <Alert
          message={
            noLiquidity ? (
              i18n._(
                t`When creating a pair you are the first liquidity provider. The ratio of tokens you add will set the price of this pool. Once you are happy with the rate, click supply to review`
              )
            ) : (
              <>
                <b>{i18n._(t`Tip:`)}</b>{' '}
                {i18n._(
                  t`By adding liquidity you'll earn 0.25% of all trades on this pair
                proportional to your share of the pool. Fees are added to the pool, accrue in real time and can be
                claimed by withdrawing your liquidity.`
                )}
              </>
            )
          }
          type="information"
        />

        <DoubleGlowShadow>
          <div className="p-4 space-y-4 rounded bg-dark-900" style={{ zIndex: 1 }}>
            {/* <AddRemoveTabs creating={isCreate} adding={true} defaultSlippage={DEFAULT_ADD_V2_SLIPPAGE_TOLERANCE} /> */}

            <ExchangeHeader
              input={currencies[Field.CURRENCY_A]}
              output={currencies[Field.CURRENCY_B]}
              allowedSlippage={allowedSlippage}
            />

            <TransactionConfirmationModal
              isOpen={showConfirm}
              onDismiss={handleDismissConfirmation}
              attemptingTxn={attemptingTxn}
              hash={txHash}
              content={() => (
                <ConfirmationModalContent
                  title={noLiquidity ? i18n._(t`You are creating a pool`) : i18n._(t`You will receive`)}
                  onDismiss={handleDismissConfirmation}
                  topContent={modalHeader}
                  bottomContent={modalBottom}
                />
              )}
              pendingText={pendingText}
            />
            <div className="flex flex-col space-y-4">
              {pair && pairState !== PairState.INVALID && (
                <LiquidityHeader input={currencies[Field.CURRENCY_A]} output={currencies[Field.CURRENCY_B]} />
              )}

              <div>
                <div>
                  <CurrencyInputPanel
                    value={formattedAmounts[Field.CURRENCY_A]}
                    onUserInput={onFieldAInput}
                    onMax={() => {
                      onFieldAInput(maxAmounts[Field.CURRENCY_A]?.toExact() ?? '')
                    }}
                    onCurrencySelect={handleCurrencyASelect}
                    showMaxButton={!atMaxAmounts[Field.CURRENCY_A]}
                    currency={currencies[Field.CURRENCY_A]}
                    id="add-liquidity-input-tokena"
                    showCommonBases
                  />
                  {currencies[Field.CURRENCY_A] &&
                    currencies[Field.CURRENCY_B] &&
                    pairState !== PairState.INVALID &&
                    userConveyorUseRelay && (
                      <div className="p-1 -mt-2 rounded-b-md bg-dark-800">
                        <ConveyorGasFee
                          gasFee={conveyorGasEstimation}
                          inputSymbol={currencyA.symbol}
                          className="bg-dark-900"
                        />
                      </div>
                    )}
                </div>

                <AutoColumn justify="space-between" className="py-2.5">
                  <AutoRow justify={isExpertMode ? 'space-between' : 'flex-start'} style={{ padding: '0 1rem' }}>
                    <button className="z-10 -mt-6 -mb-6 rounded-full cursor-default bg-dark-900 p-3px">
                      <div className="p-3 rounded-full bg-dark-800">
                        <Plus size="32" />
                      </div>
                    </button>
                  </AutoRow>
                </AutoColumn>

                <CurrencyInputPanel
                  value={formattedAmounts[Field.CURRENCY_B]}
                  onUserInput={onFieldBInput}
                  onCurrencySelect={handleCurrencyBSelect}
                  onMax={() => {
                    onFieldBInput(maxAmounts[Field.CURRENCY_B]?.toExact() ?? '')
                  }}
                  showMaxButton={!atMaxAmounts[Field.CURRENCY_B]}
                  currency={currencies[Field.CURRENCY_B]}
                  id="add-liquidity-input-tokenb"
                  showCommonBases
                />
              </div>

              {currencies[Field.CURRENCY_A] && currencies[Field.CURRENCY_B] && pairState !== PairState.INVALID && (
                <div className="p-1 rounded bg-dark-800">
                  <LiquidityPrice
                    currencies={currencies}
                    price={price}
                    noLiquidity={noLiquidity}
                    poolTokenPercentage={poolTokenPercentage}
                    className="bg-dark-900"
                  />
                </div>
              )}

              {addIsUnsupported ? (
                <Button color="gradient" size="lg" disabled>
                  {i18n._(t`Unsupported Asset`)}
                </Button>
              ) : !account ? (
                <Web3Connect size="lg" color="blue" className="w-full" />
              ) : (
                (approvalA === ApprovalState.NOT_APPROVED ||
                  approvalA === ApprovalState.PENDING ||
                  approvalB === ApprovalState.NOT_APPROVED ||
                  approvalB === ApprovalState.PENDING ||
                  isValid) && (
                  <AutoColumn gap={'md'}>
                    {
                      <RowBetween>
                        {approvalA !== ApprovalState.APPROVED && (
                          <Button
                            color="gradient"
                            size="lg"
                            onClick={approveACallback}
                            disabled={approvalA === ApprovalState.PENDING}
                            style={{
                              width: approvalB !== ApprovalState.APPROVED ? '48%' : '100%',
                            }}
                          >
                            {approvalA === ApprovalState.PENDING ? (
                              <Dots>{i18n._(t`Approving ${currencies[Field.CURRENCY_A]?.symbol}`)}</Dots>
                            ) : (
                              i18n._(t`Approve ${currencies[Field.CURRENCY_A]?.symbol}`)
                            )}
                          </Button>
                        )}
                        {approvalB !== ApprovalState.APPROVED && (
                          <Button
                            color="gradient"
                            size="lg"
                            onClick={approveBCallback}
                            disabled={approvalB === ApprovalState.PENDING}
                            style={{
                              width: approvalA !== ApprovalState.APPROVED ? '48%' : '100%',
                            }}
                          >
                            {approvalB === ApprovalState.PENDING ? (
                              <Dots>{i18n._(t`Approving ${currencies[Field.CURRENCY_B]?.symbol}`)}</Dots>
                            ) : (
                              i18n._(t`Approve ${currencies[Field.CURRENCY_B]?.symbol}`)
                            )}
                          </Button>
                        )}
                      </RowBetween>
                    }

                    {approvalA === ApprovalState.APPROVED && approvalB === ApprovalState.APPROVED && (
                      <ButtonError
                        onClick={() => {
                          isExpertMode ? onAdd() : setShowConfirm(true)
                        }}
                        disabled={
                          !isValid || approvalA !== ApprovalState.APPROVED || approvalB !== ApprovalState.APPROVED
                        }
                        error={!isValid && !!parsedAmounts[Field.CURRENCY_A] && !!parsedAmounts[Field.CURRENCY_B]}
                      >
                        {error ?? i18n._(t`Confirm Adding Liquidity`)}
                      </ButtonError>
                    )}
                  </AutoColumn>
                )
              )}
            </div>

            {!addIsUnsupported ? (
              pair && !noLiquidity && pairState !== PairState.INVALID ? (
                <MinimalPositionCard showUnwrapped={oneCurrencyIsWETH} pair={pair} />
              ) : null
            ) : (
              <UnsupportedCurrencyFooter
                show={addIsUnsupported}
                currencies={[currencies.CURRENCY_A, currencies.CURRENCY_B]}
              />
            )}
          </div>
        </DoubleGlowShadow>
      </Container>
    </>
  )
}
