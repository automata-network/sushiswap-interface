import { ApprovalState, useApproveCallback } from '../../../hooks/useApproveCallback'
import { ArrowDown, Plus } from 'react-feather'
import { AutoRow, RowBetween } from '../../../components/Row'
import { ButtonConfirmed, ButtonError } from '../../../components/Button'
import { ChainId, Currency, NATIVE, Percent, WNATIVE, WNATIVE_ADDRESS } from '@sushiswap/sdk'
import React, { useCallback, useMemo, useState } from 'react'
import TransactionConfirmationModal, { ConfirmationModalContent } from '../../../modals/TransactionConfirmationModal'
import { calculateGasMargin, calculateSlippageAmount } from '../../../functions/trade'
import { useBurnActionHandlers, useBurnState, useDerivedBurnInfo } from '../../../state/burn/hooks'
import { useConveyorRouterContract, usePairContract, useRouterContract } from '../../../hooks/useContract'

import Alert from '../../../components/Alert'
import { ArrowDownIcon } from '@heroicons/react/solid'
import { AutoColumn } from '../../../components/Column'
import { BigNumber } from '@ethersproject/bignumber'
import Button from '../../../components/Button'
import Container from '../../../components/Container'
import { Contract } from '@ethersproject/contracts'
import CurrencyLogo from '../../../components/CurrencyLogo'
import Dots from '../../../components/Dots'
import DoubleGlowShadow from '../../../components/DoubleGlowShadow'
import { Field } from '../../../state/burn/actions'
import Head from 'next/head'
import Header from '../../../features/trade/Header'
import Link from 'next/link'
import LiquidityHeader from '../../../features/exchange-v1/liquidity/LiquidityHeader'
import LiquidityPrice from '../../../features/exchange-v1/liquidity/LiquidityPrice'
import { MinimalPositionCard } from '../../../components/PositionCard'
import NavLink from '../../../components/NavLink'
import PercentInputPanel from '../../../components/PercentInputPanel'
import ReactGA from 'react-ga'
import RemoveLiquidityReceiveDetails from '../../../features/exchange-v1/liquidity/RemoveLiquidityReceiveDetails'
import { TransactionResponse } from '@ethersproject/providers'
import Web3Connect from '../../../components/Web3Connect'
import { currencyId } from '../../../functions/currency'
import { splitSignature } from '@ethersproject/bytes'
import { t } from '@lingui/macro'
import { useActiveWeb3React } from '../../../hooks/useActiveWeb3React'
import { useCurrency } from '../../../hooks/Tokens'
import useDebouncedChangeHandler from '../../../hooks/useDebouncedChangeHandler'
import { useDerivedMintInfo } from '../../../state/mint/hooks'
import useIsArgentWallet from '../../../hooks/useIsArgentWallet'
import { useLingui } from '@lingui/react'
import { useRouter } from 'next/router'
import { useTransactionAdder } from '../../../state/transactions/hooks'
import useTransactionDeadline from '../../../hooks/useTransactionDeadline'
import {
  useIsExpertMode,
  useUserConveyorUseRelay,
  useUserLiquidityGasLimit,
  // useUserMaxTokenAmount,
  useUserSlippageToleranceWithDefault,
} from '../../../state/user/hooks'
import { useV2LiquidityTokenPermit } from '../../../hooks/useERC20Permit'
import { useWalletModalToggle } from '../../../state/application/hooks'
import { calculateConveyorFeeOnToken } from '../../../functions/conveyorFee'
import { ADD_LIQUIDITY_GAS_LIMIT } from '../../../constants'
import { CONVEYOR_RELAYER_URI } from '../../../config/conveyor'
import { utils } from 'ethers'
import { BigNumber as JSBigNumber } from 'bignumber.js'
import { toRawAmount } from '../../../functions/conveyor/helpers'
import { EIP712_DOMAIN_TYPE, FORWARDER_TYPE, PERMIT_TYPE } from '../../../constants/abis/conveyor-v2'
import useNodeEnvironment from '../../../hooks/useNodeEnvironment'

const { keccak256, toUtf8Bytes, defaultAbiCoder, Interface } = utils

const DEFAULT_REMOVE_LIQUIDITY_SLIPPAGE_TOLERANCE = new Percent(5, 100)

const REMOVE_TIPS = {}

export default function Remove() {
  const { i18n } = useLingui()
  const router = useRouter()
  const tokens = router.query.tokens
  const [currencyIdA, currencyIdB] = tokens || [undefined, undefined]
  const [currencyA, currencyB] = [useCurrency(currencyIdA) ?? undefined, useCurrency(currencyIdB) ?? undefined]
  const { account, chainId, library } = useActiveWeb3React()
  const [tokenA, tokenB] = useMemo(() => [currencyA?.wrapped, currencyB?.wrapped], [currencyA, currencyB])

  // toggle wallet when disconnected
  const toggleWalletModal = useWalletModalToggle()

  const { price } = useDerivedMintInfo(currencyA ?? undefined, currencyB ?? undefined)

  // burn state
  const { independentField, typedValue } = useBurnState()
  const { pair, parsedAmounts, error } = useDerivedBurnInfo(currencyA ?? undefined, currencyB ?? undefined)
  const { onUserInput: _onUserInput } = useBurnActionHandlers()
  const isValid = !error

  // modal and loading
  const [showConfirm, setShowConfirm] = useState<boolean>(false)
  const [showDetailed, setShowDetailed] = useState<boolean>(false)
  const [attemptingTxn, setAttemptingTxn] = useState(false) // clicked confirm

  // txn values
  const [txHash, setTxHash] = useState<string>('')
  const deadline = useTransactionDeadline()
  const allowedSlippage = useUserSlippageToleranceWithDefault(DEFAULT_REMOVE_LIQUIDITY_SLIPPAGE_TOLERANCE)

  const formattedAmounts = {
    [Field.LIQUIDITY_PERCENT]: parsedAmounts[Field.LIQUIDITY_PERCENT].equalTo('0')
      ? '0'
      : parsedAmounts[Field.LIQUIDITY_PERCENT].lessThan(new Percent('1', '100'))
      ? '<1'
      : parsedAmounts[Field.LIQUIDITY_PERCENT].toFixed(0),
    [Field.LIQUIDITY]:
      independentField === Field.LIQUIDITY ? typedValue : parsedAmounts[Field.LIQUIDITY]?.toSignificant(6) ?? '',
    [Field.CURRENCY_A]:
      independentField === Field.CURRENCY_A ? typedValue : parsedAmounts[Field.CURRENCY_A]?.toSignificant(6) ?? '',
    [Field.CURRENCY_B]:
      independentField === Field.CURRENCY_B ? typedValue : parsedAmounts[Field.CURRENCY_B]?.toSignificant(6) ?? '',
  }

  const atMaxAmount = parsedAmounts[Field.LIQUIDITY_PERCENT]?.equalTo(new Percent('1'))

  // pair contract
  const pairContract: Contract | null = usePairContract(pair?.liquidityToken?.address)

  // router contract
  const routerContract = useRouterContract()

  // Conveyor v2 setup
  const [userConveyorUseRelay] = useUserConveyorUseRelay()
  const conveyorRouterContract = useConveyorRouterContract()
  const [EIP712Msg, setEIP712Msg] = useState<any | null>(null)
  const [conveyorSignatureData, setConveyorSignatureData] = useState<{
    v: number
    r: string
    s: string
    deadline: number
  } | null>(null)

  // allowance handling
  const { gatherPermitSignature, signatureData } = useV2LiquidityTokenPermit(
    parsedAmounts[Field.LIQUIDITY],
    !userConveyorUseRelay ? routerContract?.address : conveyorRouterContract?.address
  )
  const [approval, approveCallback] = useApproveCallback(
    parsedAmounts[Field.LIQUIDITY],
    !userConveyorUseRelay ? routerContract?.address : conveyorRouterContract?.address
  )

  async function onAttemptToApprove() {
    if (!pairContract || !pair || !library || !deadline) throw new Error('missing dependencies')
    const liquidityAmount = parsedAmounts[Field.LIQUIDITY]
    if (!liquidityAmount) throw new Error('missing liquidity amount')
    const parsedLiquidityAmount = liquidityAmount.toFixed(liquidityAmount.currency.decimals, {
      decimalSeparator: '',
      groupSeparator: '',
    })

    if (!userConveyorUseRelay) {
      // Use default sushi approval
      if (chainId !== ChainId.HARMONY && gatherPermitSignature) {
        try {
          await gatherPermitSignature()
        } catch (error) {
          // try to approve if gatherPermitSignature failed for any reason other than the user rejecting it
          if (error?.code !== 4001) {
            await approveCallback()
          }
        }
      } else {
        await approveCallback()
      }
    } else {
      // Use Conveyor v2 approval
      const { [Field.CURRENCY_A]: currencyAmountA, [Field.CURRENCY_B]: currencyAmountB } = parsedAmounts
      if (!currencyAmountA || !currencyAmountB) {
        throw new Error('missing currency amounts')
      }

      // try to gather a signature for permission
      const nonce = await pairContract.nonces(account)

      const domain = {
        name: 'Conveyor V2',
        version: '1',
        chainId: BigNumber.from(chainId).toHexString(),
        verifyingContract: pair.liquidityToken.address,
      }

      const message = {
        owner: account,
        spender: conveyorRouterContract?.address,
        value: BigNumber.from(parsedLiquidityAmount).toHexString(),
        nonce: nonce.toHexString(),
        deadline: deadline.toHexString(),
      }

      const _EIP712Msg = {
        types: {
          EIP712Domain: EIP712_DOMAIN_TYPE,
          Permit: PERMIT_TYPE,
        },
        domain,
        primaryType: 'Permit',
        message,
      }

      const data = JSON.stringify(_EIP712Msg)

      // Here we use state so we can retrieve the value later in onRemove callback
      setEIP712Msg(_EIP712Msg)

      const signature = await library.send('eth_signTypedData_v4', [account, data])
      const { r, s, v } = splitSignature(signature)
      setConveyorSignatureData({ r, s, v, deadline: deadline.toNumber() })
    }
  }

  // wrapped onUserInput to clear signatures
  const onUserInput = useCallback(
    (field: Field, typedValue: string) => {
      return _onUserInput(field, typedValue)
    },
    [_onUserInput]
  )

  const onLiquidityInput = useCallback(
    (typedValue: string): void => onUserInput(Field.LIQUIDITY, typedValue),
    [onUserInput]
  )
  const onCurrencyAInput = useCallback(
    (typedValue: string): void => onUserInput(Field.CURRENCY_A, typedValue),
    [onUserInput]
  )
  const onCurrencyBInput = useCallback(
    (typedValue: string): void => onUserInput(Field.CURRENCY_B, typedValue),
    [onUserInput]
  )

  // tx sending
  const addTransaction = useTransactionAdder()

  // const [userMaxTokenAmount] = useUserMaxTokenAmount()

  const isExpertMode = useIsExpertMode()

  const [userLiquidityGasLimit] = useUserLiquidityGasLimit()

  const { deploymentEnv } = useNodeEnvironment()

  async function onRemove() {
    if (!chainId || !library || !account || !deadline || !router) throw new Error('missing dependencies')
    const { [Field.CURRENCY_A]: currencyAmountA, [Field.CURRENCY_B]: currencyAmountB } = parsedAmounts
    if (!currencyAmountA || !currencyAmountB) {
      throw new Error('missing currency amounts')
    }

    const amountsMin = {
      [Field.CURRENCY_A]: calculateSlippageAmount(currencyAmountA, allowedSlippage)[0],
      [Field.CURRENCY_B]: calculateSlippageAmount(currencyAmountB, allowedSlippage)[0],
    }

    if (!currencyA || !currencyB) throw new Error('missing tokens')

    const liquidityAmount = parsedAmounts[Field.LIQUIDITY]
    if (!liquidityAmount) throw new Error('missing liquidity amount')

    const parsedLiquidityAmount = toRawAmount(liquidityAmount)

    if (!userConveyorUseRelay) {
      // Default sushi removal process
      const currencyBIsETH = currencyB.isNative
      const oneCurrencyIsETH = currencyA.isNative || currencyBIsETH

      if (!tokenA || !tokenB) throw new Error('could not wrap')

      let methodNames: string[], args: Array<string | string[] | number | boolean>
      // we have approval, use normal remove liquidity
      if (approval === ApprovalState.APPROVED) {
        // removeLiquidityETH
        if (oneCurrencyIsETH) {
          methodNames = ['removeLiquidityETH', 'removeLiquidityETHSupportingFeeOnTransferTokens']
          args = [
            currencyBIsETH ? tokenA.address : tokenB.address,
            liquidityAmount.quotient.toString(),
            amountsMin[currencyBIsETH ? Field.CURRENCY_A : Field.CURRENCY_B].toString(),
            amountsMin[currencyBIsETH ? Field.CURRENCY_B : Field.CURRENCY_A].toString(),
            account,
            deadline.toHexString(),
          ]
        }
        // removeLiquidity
        else {
          methodNames = ['removeLiquidity']
          args = [
            tokenA.address,
            tokenB.address,
            liquidityAmount.quotient.toString(),
            amountsMin[Field.CURRENCY_A].toString(),
            amountsMin[Field.CURRENCY_B].toString(),
            account,
            deadline.toHexString(),
          ]
        }
      }
      // we have a signature, use permit versions of remove liquidity
      else if (signatureData !== null) {
        // removeLiquidityETHWithPermit
        if (oneCurrencyIsETH) {
          methodNames = ['removeLiquidityETHWithPermit', 'removeLiquidityETHWithPermitSupportingFeeOnTransferTokens']
          args = [
            currencyBIsETH ? tokenA.address : tokenB.address,
            liquidityAmount.quotient.toString(),
            amountsMin[currencyBIsETH ? Field.CURRENCY_A : Field.CURRENCY_B].toString(),
            amountsMin[currencyBIsETH ? Field.CURRENCY_B : Field.CURRENCY_A].toString(),
            account,
            signatureData.deadline,
            false,
            signatureData.v,
            signatureData.r,
            signatureData.s,
          ]
        }
        // removeLiquidityETHWithPermit
        else {
          methodNames = ['removeLiquidityWithPermit']
          args = [
            tokenA.address,
            tokenB.address,
            liquidityAmount.quotient.toString(),
            amountsMin[Field.CURRENCY_A].toString(),
            amountsMin[Field.CURRENCY_B].toString(),
            account,
            signatureData.deadline,
            false,
            signatureData.v,
            signatureData.r,
            signatureData.s,
          ]
        }
      } else {
        throw new Error('Attempting to confirm without approval or a signature. Please contact support.')
      }

      const safeGasEstimates: (BigNumber | undefined)[] = await Promise.all(
        methodNames.map((methodName) =>
          routerContract.estimateGas[methodName](...args)
            .then(calculateGasMargin)
            .catch((error) => {
              console.error(`estimateGas failed`, methodName, args, error)
              return undefined
            })
        )
      )

      const indexOfSuccessfulEstimation = safeGasEstimates.findIndex((safeGasEstimate) =>
        BigNumber.isBigNumber(safeGasEstimate)
      )

      // all estimations failed...
      if (indexOfSuccessfulEstimation === -1) {
        console.error('This transaction would fail. Please contact support.')
      } else {
        const methodName = methodNames[indexOfSuccessfulEstimation]
        const safeGasEstimate = safeGasEstimates[indexOfSuccessfulEstimation]

        setAttemptingTxn(true)
        await routerContract[methodName](...args, {
          gasLimit: safeGasEstimate,
        })
          .then((response: TransactionResponse) => {
            setAttemptingTxn(false)

            addTransaction(response, {
              summary: t`Remove ${parsedAmounts[Field.CURRENCY_A]?.toSignificant(3)} ${
                currencyA?.symbol
              } and ${parsedAmounts[Field.CURRENCY_B]?.toSignificant(3)} ${currencyB?.symbol}`,
            })

            setTxHash(response.hash)

            ReactGA.event({
              category: 'Liquidity',
              action: 'Remove',
              label: [currencyA?.symbol, currencyB?.symbol].join('/'),
            })
          })
          .catch((error: Error) => {
            setAttemptingTxn(false)
            // we only care if the error is something _other_ than the user rejected the tx
            console.error(error)
          })
      }
    } else {
      // RPC call for Conveyor v2 removal process
      if (conveyorSignatureData === null) {
        throw new Error('Liquidity approval failed')
      }

      const gasPrice = await library?.getGasPrice()
      const userGasLimit = isExpertMode ? userLiquidityGasLimit : ADD_LIQUIDITY_GAS_LIMIT
      const gasLimit = BigNumber.from(userGasLimit)
      const feeOnTokenA = await calculateConveyorFeeOnToken(
        chainId,
        currencyA.wrapped.address,
        WNATIVE[chainId].decimals,
        gasPrice === undefined ? undefined : gasPrice.mul(gasLimit)
      )
      const maxTokenAmount = feeOnTokenA.toFixed(0)

      console.table({
        inputAmountA: currencyAmountA,
        inputAmountB: currencyAmountB,
        baseGasPrice: gasPrice.toString(),
        gasLimit: gasLimit.toString(),
        maxTokenAmount: maxTokenAmount,
      })

      const domain = {
        name: 'Conveyor V2',
        version: '1',
        chainId: BigNumber.from(chainId).toHexString(),
        verifyingContract: conveyorRouterContract.address,
      }

      const removePayload = {
        tokenA: currencyA.wrapped.address,
        tokenB: currencyB.wrapped.address,
        liquidity: BigNumber.from(parsedLiquidityAmount).toHexString(),
        amountAMin: BigNumber.from(amountsMin.CURRENCY_A.toString()).toHexString(),
        amountBMin: BigNumber.from(amountsMin.CURRENCY_B.toString()).toHexString(),
        user: account,
        deadline: deadline.toHexString(),
      }

      const signaturePayload = {
        v: conveyorSignatureData.v,
        r: conveyorSignatureData.r,
        s: conveyorSignatureData.s,
      }

      const fnParams = [
        'tuple(address tokenA,address tokenB,uint256 liquidity,uint256 amountAMin,uint256 amountBMin,address user,uint256 deadline)',
        'tuple(uint8 v,bytes32 r,bytes32 s)',
      ]
      const fnData = [`function removeLiquidityWithPermit(${fnParams[0]}, ${fnParams[1]})`]
      const fnDataIface = new Interface(fnData)

      const nonce: BigNumber = await conveyorRouterContract.nonces(account)

      const message = {
        from: account,
        feeToken: currencyA.wrapped.address,
        maxTokenAmount: BigNumber.from(maxTokenAmount).toHexString(),
        deadline: deadline.toHexString(),
        nonce: nonce.toHexString(),
        data: fnDataIface.encodeFunctionData('removeLiquidityWithPermit', [removePayload, signaturePayload]),
        hashedPayload: keccak256(
          defaultAbiCoder.encode(
            [
              'bytes',
              'address',
              'address',
              'uint256',
              'uint256',
              'uint256',
              'address',
              'uint256',
              'uint8',
              'bytes32',
              'bytes32',
            ],
            [
              keccak256(
                toUtf8Bytes(
                  'removeLiquidityWithPermit(address tokenA,address tokenB,uint256 liquidity,uint256 amountAMin,uint256 amountBMin,address user,uint256 deadline,uint8 v,bytes32 r,bytes32 s)'
                )
              ),
              ...Object.entries({ ...removePayload, ...signaturePayload }).map(([_, value]) => value),
            ]
          )
        ),
      }

      console.log('message', message)

      const EIP712Msg = {
        types: {
          EIP712Domain: EIP712_DOMAIN_TYPE,
          Forwarder: FORWARDER_TYPE,
          // RemoveLiquidity,
        },
        domain,
        primaryType: 'Forwarder',
        message,
      }

      const data = JSON.stringify(EIP712Msg)

      setAttemptingTxn(true)

      const signature = await library.send('eth_signTypedData_v4', [account, data])
      const { v, r, s } = splitSignature(signature)

      const params = [chainId, EIP712Msg, v.toString(), r, s]

      const jsonRPCRequest = {
        jsonrpc: '2.0',
        method: '/v2/metaTx/removeLiquidity',
        id: 1,
        params,
      }

      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jsonRPCRequest),
      }

      const jsonRPCResponse = await fetch(CONVEYOR_RELAYER_URI[deploymentEnv][chainId]!, requestOptions)
      const { result: response } = await jsonRPCResponse.json()

      setAttemptingTxn(false)

      if (response.success === true) {
        const [parsedAmountA, parsedAmountB] = [
          parsedAmounts[Field.CURRENCY_A]?.toSignificant(3),
          parsedAmounts[Field.CURRENCY_B]?.toSignificant(3),
        ]
        addTransaction(
          { hash: response.txnHash },
          {
            summary: `Remove ${parsedAmountA} ${currencyA?.symbol} and ${parsedAmountB} ${currencyB?.symbol}`,
          }
        )

        setTxHash(response.txnHash)
        setConveyorSignatureData(null)
        if (isExpertMode) {
          setShowConfirm(true)
        }
      } else {
        console.error(response.errorMessage)
        return
      }
    }
  }

  function modalHeader() {
    return (
      <div className="grid gap-4 pt-3 pb-4">
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CurrencyLogo currency={currencyA} size={48} />
              <div className="text-2xl font-bold text-high-emphesis">
                {parsedAmounts[Field.CURRENCY_A]?.toSignificant(6)}
              </div>
            </div>
            <div className="ml-3 text-2xl font-medium text-high-emphesis">{currencyA?.symbol}</div>
          </div>
          <div className="ml-3 mr-3 min-w-[24px]">
            <Plus size={24} />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CurrencyLogo currency={currencyB} size={48} />
              <div className="text-2xl font-bold text-high-emphesis">
                {parsedAmounts[Field.CURRENCY_B]?.toSignificant(6)}
              </div>
            </div>
            <div className="ml-3 text-2xl font-medium text-high-emphesis">{currencyB?.symbol}</div>
          </div>
        </div>
        <div className="justify-start text-sm text-secondary">
          {t`Output is estimated. If the price changes by more than ${allowedSlippage.toSignificant(
            4
          )}% your transaction will revert.`}
        </div>
      </div>
    )
  }

  function modalBottom() {
    return (
      <div className="p-6 mt-0 -m-6 bg-dark-800">
        {pair && (
          <>
            <div className="grid gap-1">
              <div className="flex items-center justify-between">
                <div className="text-sm text-high-emphesis">{i18n._(t`Rates`)}</div>
                <div className="text-sm font-bold justify-center items-center flex right-align pl-1.5 text-high-emphesis">
                  {`1 ${currencyA?.symbol} = ${tokenA ? pair.priceOf(tokenA).toSignificant(6) : '-'} ${
                    currencyB?.symbol
                  }`}
                </div>
              </div>
              <div className="flex items-center justify-end">
                <div className="text-sm font-bold justify-center items-center flex right-align pl-1.5 text-high-emphesis">
                  {`1 ${currencyB?.symbol} = ${tokenB ? pair.priceOf(tokenB).toSignificant(6) : '-'} ${
                    currencyA?.symbol
                  }`}
                </div>
              </div>
            </div>
            <div className="h-px my-6 bg-gray-700" />
          </>
        )}
        <div className="grid gap-1 pb-6">
          <div className="flex items-center justify-between">
            <div className="text-sm text-secondary">{i18n._(t`${currencyA?.symbol}/${currencyB?.symbol} Burned`)}</div>
            <div className="text-sm font-bold justify-center items-center flex right-align pl-1.5 text-high-emphasis">
              {parsedAmounts[Field.LIQUIDITY]?.toSignificant(6)}
            </div>
          </div>
        </div>
        {!userConveyorUseRelay ? (
          <Button
            color="gradient"
            size="lg"
            disabled={!(approval === ApprovalState.APPROVED || signatureData !== null)}
            onClick={onRemove}
          >
            {i18n._(t`Confirm`)}
          </Button>
        ) : (
          <Button
            color="gradient"
            size="lg"
            disabled={!(approval === ApprovalState.APPROVED || conveyorSignatureData !== null)}
            onClick={onRemove}
          >
            {i18n._(t`Confirm`)}
          </Button>
        )}
      </div>
    )
  }

  const pendingText = i18n._(
    t`Removing ${parsedAmounts[Field.CURRENCY_A]?.toSignificant(6)} ${currencyA?.symbol} and ${parsedAmounts[
      Field.CURRENCY_B
    ]?.toSignificant(6)} ${currencyB?.symbol}`
  )

  const liquidityPercentChangeCallback = useCallback(
    (value: string) => {
      onUserInput(Field.LIQUIDITY_PERCENT, value)

      if (conveyorSignatureData !== null) {
        setConveyorSignatureData(null)
      }
    },
    [conveyorSignatureData, onUserInput]
  )

  const oneCurrencyIsETH = currencyA?.isNative || currencyB?.isNative

  const oneCurrencyIsWETH = Boolean(
    chainId && WNATIVE[chainId] && (currencyA?.equals(WNATIVE[chainId]) || currencyB?.equals(WNATIVE[chainId]))
  )

  const handleSelectCurrencyA = useCallback(
    (currency: Currency) => {
      if (currencyIdB && currencyId(currency) === currencyIdB) {
        router.push(`/remove/${currencyId(currency)}/${currencyIdA}`)
      } else {
        router.push(`/remove/${currencyId(currency)}/${currencyIdB}`)
      }
    },
    [currencyIdA, currencyIdB, router]
  )

  const handleSelectCurrencyB = useCallback(
    (currency: Currency) => {
      if (currencyIdA && currencyId(currency) === currencyIdA) {
        router.push(`/remove/${currencyIdB}/${currencyId(currency)}`)
      } else {
        router.push(`/remove/${currencyIdA}/${currencyId(currency)}`)
      }
    },
    [currencyIdA, currencyIdB, router]
  )

  const handleDismissConfirmation = useCallback(() => {
    setShowConfirm(false)
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onUserInput(Field.LIQUIDITY_PERCENT, '0')
    }
    setTxHash('')
  }, [onUserInput, txHash])

  const [innerLiquidityPercentage, setInnerLiquidityPercentage] = useDebouncedChangeHandler(
    parsedAmounts[Field.LIQUIDITY_PERCENT].toFixed(0),
    liquidityPercentChangeCallback
  )

  return (
    <Container id="remove-liquidity-page" className="py-4 space-y-4 md:py-8 lg:py-12" maxWidth="2xl">
      <Head>
        <title>Remove Liquidity | Sushi</title>
        <meta key="description" name="description" content="Remove liquidity from the SushiSwap AMM" />
      </Head>
      <div className="px-4 mb-5">
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
      </div>

      <DoubleGlowShadow>
        <div className="p-4 space-y-4 rounded bg-dark-900" style={{ zIndex: 1 }}>
          {/* <AddRemoveTabs
          creating={false}
          adding={false}
          defaultSlippage={DEFAULT_REMOVE_LIQUIDITY_SLIPPAGE_TOLERANCE}
        /> */}
          <Header input={currencyA} output={currencyB} allowedSlippage={allowedSlippage} />
          <div>
            <TransactionConfirmationModal
              isOpen={showConfirm}
              onDismiss={handleDismissConfirmation}
              attemptingTxn={attemptingTxn}
              hash={txHash ? txHash : ''}
              content={() => (
                <ConfirmationModalContent
                  title={i18n._(t`You will receive`)}
                  onDismiss={handleDismissConfirmation}
                  topContent={modalHeader}
                  bottomContent={modalBottom}
                />
              )}
              pendingText={pendingText}
            />
            <AutoColumn gap="md">
              {/* <LiquidityHeader input={currencyA} output={currencyB} /> */}

              <div>
                <PercentInputPanel
                  value={innerLiquidityPercentage}
                  onUserInput={setInnerLiquidityPercentage}
                  id="liquidity-percent"
                />

                <AutoColumn justify="space-between" className="py-2.5">
                  <AutoRow justify={'flex-start'} style={{ padding: '0 1rem' }}>
                    <button className="z-10 -mt-6 -mb-6 rounded-full cursor-default bg-dark-900 p-3px">
                      <div className="p-3 rounded-full bg-dark-800">
                        <ArrowDownIcon width="32px" height="32px" />
                      </div>
                    </button>
                  </AutoRow>
                </AutoColumn>

                <div id="remove-liquidity-output" className="p-5 rounded bg-dark-800">
                  <div className="flex flex-col justify-between space-y-3 sm:space-y-0 sm:flex-row">
                    <div className="w-full text-white sm:w-2/5" style={{ margin: 'auto 0px' }}>
                      <AutoColumn>
                        <div>You Will Receive:</div>
                        {chainId && (oneCurrencyIsWETH || oneCurrencyIsETH) && !userConveyorUseRelay ? (
                          <RowBetween className="text-sm">
                            {oneCurrencyIsETH ? (
                              <Link
                                href={`/remove/${currencyA?.isNative ? WNATIVE_ADDRESS[chainId] : currencyIdA}/${
                                  currencyB?.isNative ? WNATIVE_ADDRESS[chainId] : currencyIdB
                                }`}
                              >
                                <a className="text-baseline text-blue opacity-80 hover:opacity-100 focus:opacity-100 whitespace-nowrap">
                                  Receive W{NATIVE[chainId].symbol}
                                </a>
                              </Link>
                            ) : oneCurrencyIsWETH ? (
                              <Link
                                href={`/remove/${currencyA?.equals(WNATIVE[chainId]) ? 'ETH' : currencyIdA}/${
                                  currencyB?.equals(WNATIVE[chainId]) ? 'ETH' : currencyIdB
                                }`}
                              >
                                <a className="text-baseline text-blue opacity-80 hover:opacity-100 whitespace-nowrap">
                                  Receive {NATIVE[chainId].symbol}
                                </a>
                              </Link>
                            ) : null}
                          </RowBetween>
                        ) : null}
                      </AutoColumn>
                    </div>

                    <div className="flex flex-col space-y-3 md:flex-row md:space-x-6 md:space-y-0">
                      <div className="flex flex-row items-center w-full p-3 pr-8 space-x-3 rounded bg-dark-900">
                        <CurrencyLogo currency={currencyA} size="46px" />
                        <AutoColumn>
                          <div className="text-white">{formattedAmounts[Field.CURRENCY_A] || '-'}</div>
                          <div className="text-sm">{currencyA?.symbol}</div>
                        </AutoColumn>
                      </div>
                      <div className="flex flex-row items-center w-full p-3 pr-8 space-x-3 rounded bg-dark-900">
                        <CurrencyLogo currency={currencyB} size="46px" />
                        <AutoColumn>
                          <div className="text-white">{formattedAmounts[Field.CURRENCY_B] || '-'}</div>
                          <div className="text-sm">{currencyB?.symbol}</div>
                        </AutoColumn>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ position: 'relative' }}>
                {!account ? (
                  <Web3Connect size="lg" color="blue" className="w-full" />
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {!userConveyorUseRelay ? (
                      <ButtonConfirmed
                        onClick={onAttemptToApprove}
                        confirmed={approval === ApprovalState.APPROVED || signatureData !== null}
                        disabled={approval !== ApprovalState.NOT_APPROVED || signatureData !== null}
                      >
                        {approval === ApprovalState.PENDING ? (
                          <Dots>{i18n._(t`Approving`)}</Dots>
                        ) : approval === ApprovalState.APPROVED || signatureData !== null ? (
                          i18n._(t`Approved`)
                        ) : (
                          i18n._(t`Approve`)
                        )}
                      </ButtonConfirmed>
                    ) : (
                      <ButtonConfirmed
                        onClick={onAttemptToApprove}
                        confirmed={approval === ApprovalState.APPROVED || conveyorSignatureData !== null}
                        disabled={approval !== ApprovalState.NOT_APPROVED || conveyorSignatureData !== null}
                      >
                        {approval === ApprovalState.PENDING ? (
                          <Dots>{i18n._(t`Approving`)}</Dots>
                        ) : approval === ApprovalState.APPROVED || conveyorSignatureData !== null ? (
                          i18n._(t`Approved`)
                        ) : (
                          i18n._(t`Approve`)
                        )}
                      </ButtonConfirmed>
                    )}

                    {!userConveyorUseRelay ? (
                      <ButtonError
                        onClick={() => {
                          setShowConfirm(true)
                        }}
                        disabled={!isValid || (signatureData === null && approval !== ApprovalState.APPROVED)}
                        error={!isValid && !!parsedAmounts[Field.CURRENCY_A] && !!parsedAmounts[Field.CURRENCY_B]}
                      >
                        {error || i18n._(t`Confirm Withdrawal`)}
                      </ButtonError>
                    ) : (
                      <ButtonError
                        onClick={() => {
                          isExpertMode ? onRemove() : setShowConfirm(true)
                        }}
                        disabled={!isValid || (conveyorSignatureData === null && approval !== ApprovalState.APPROVED)}
                        error={!isValid && !!parsedAmounts[Field.CURRENCY_A] && !!parsedAmounts[Field.CURRENCY_B]}
                      >
                        {error || i18n._(t`Confirm Withdrawal`)}
                      </ButtonError>
                    )}
                  </div>
                )}
              </div>
            </AutoColumn>
          </div>

          {pair ? <MinimalPositionCard showUnwrapped={oneCurrencyIsWETH} pair={pair} /> : null}
        </div>
      </DoubleGlowShadow>
    </Container>
  )
}
