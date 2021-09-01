import { BIPS_BASE, EIP_1559_ACTIVATION_BLOCK, HOP_ADDITIONAL_GAS, SWAP_GAS_LIMIT } from '../constants'
import {
  ChainId,
  Currency,
  CurrencyAmount,
  Ether,
  JSBI,
  Percent,
  Router,
  TradeType,
  Trade as V2Trade,
  Token,
} from '@sushiswap/sdk'
import { arrayify, hexlify, splitSignature } from '@ethersproject/bytes'
import { isAddress, isZero } from '../functions/validate'
import { useConveyorRouterContract, useFactoryContract, useRouterContract } from './useContract'

import { ARCHER_RELAY_URI } from '../config/archer'
import { ArcherRouter } from '../functions/archerRouter'
import { BigNumber } from '@ethersproject/bignumber'
import Common from '@ethereumjs/common'
import { SignatureData } from './useERC20Permit'
import { TransactionFactory } from '@ethereumjs/tx'
import { TransactionRequest } from '@ethersproject/abstract-provider'
import approveAmountCalldata from '../functions/approveAmountCalldata'
import { calculateGasMargin } from '../functions/trade'
import { keccak256 } from '@ethersproject/keccak256'
import { shortenAddress } from '../functions/format'
import { t } from '@lingui/macro'
import { useActiveWeb3React } from './useActiveWeb3React'
import { useArgentWalletContract } from './useArgentWalletContract'
import { useBlockNumber } from '../state/application/hooks'
import useENS from './useENS'
import { useMemo } from 'react'
import { useTransactionAdder } from '../state/transactions/hooks'
import useTransactionDeadline from './useTransactionDeadline'
import { useUserArcherETHTip, useUserConveyorUseRelay } from '../state/user/hooks'
import { CONVEYOR_RELAYER_URI } from '../config/conveyor'
import { useSwapState } from '../state/swap/hooks'
import { WrappedTokenInfo } from '../state/lists/wrappedTokenInfo'
import { BigNumber as JSBigNumber } from 'bignumber.js'
import { Interface } from '@ethersproject/abi'
import { CONVEYOR_V2_ROUTER_ADDRESS } from '../constants/abis/conveyor-v2'
import { calculateConveyorFeeOnToken } from '../functions/conveyorFee'
import { utils } from 'ethers'

const { defaultAbiCoder, toUtf8Bytes, solidityPack, Interface: EthInterface } = utils

export enum SwapCallbackState {
  INVALID,
  LOADING,
  VALID,
}

interface SwapCall {
  address: string
  calldata: string
  value: string
}

interface SwapCallEstimate {
  call: SwapCall
}

export interface SuccessfulCall extends SwapCallEstimate {
  call: SwapCall
  gasEstimate: BigNumber
}

interface FailedCall extends SwapCallEstimate {
  call: SwapCall
  error: Error
}

export type EstimatedSwapCall = SuccessfulCall | FailedCall

/**
 * Returns the swap calls that can be used to make the trade
 * @param trade trade to execute
 * @param allowedSlippage user allowed slippage
 * @param recipientAddressOrName the ENS name or address of the recipient of the swap output
 * @param signatureData the signature data of the permit of the input token amount, if available
 */
export function useSwapCallArguments(
  trade: V2Trade<Currency, Currency, TradeType> | undefined, // trade to execute, required
  allowedSlippage: Percent, // in bips
  recipientAddressOrName: string | null, // the ENS name or address of the recipient of the trade, or null if swap should be returned to sender
  signatureData: SignatureData | null | undefined,
  useArcher: boolean = false
): SwapCall[] {
  const { account, chainId, library } = useActiveWeb3React()

  const { address: recipientAddress } = useENS(recipientAddressOrName)
  const recipient = recipientAddressOrName === null ? account : recipientAddress
  const deadline = useTransactionDeadline()

  const routerContract = useRouterContract(useArcher)
  const factoryContract = useFactoryContract()

  const argentWalletContract = useArgentWalletContract()

  const [archerETHTip] = useUserArcherETHTip()

  return useMemo(() => {
    if (!trade || !recipient || !library || !account || !chainId || !deadline) return []

    if (trade instanceof V2Trade) {
      if (!routerContract) return []
      const swapMethods = []
      if (!useArcher) {
        swapMethods.push(
          Router.swapCallParameters(trade, {
            feeOnTransfer: false,
            allowedSlippage,
            recipient,
            deadline: deadline.toNumber(),
          })
        )

        if (trade.tradeType === TradeType.EXACT_INPUT) {
          swapMethods.push(
            Router.swapCallParameters(trade, {
              feeOnTransfer: true,
              allowedSlippage,
              recipient,
              deadline: deadline.toNumber(),
            })
          )
        }
      } else {
        swapMethods.push(
          ArcherRouter.swapCallParameters(factoryContract.address, trade, {
            allowedSlippage,
            recipient,
            ttl: deadline.toNumber(),
            ethTip: CurrencyAmount.fromRawAmount(Ether.onChain(ChainId.MAINNET), archerETHTip),
          })
        )
      }
      return swapMethods.map(({ methodName, args, value }) => {
        if (argentWalletContract && trade.inputAmount.currency.isToken) {
          return {
            address: argentWalletContract.address,
            calldata: argentWalletContract.interface.encodeFunctionData('wc_multiCall', [
              [
                approveAmountCalldata(trade.maximumAmountIn(allowedSlippage), routerContract.address),
                {
                  to: routerContract.address,
                  value: value,
                  data: routerContract.interface.encodeFunctionData(methodName, args),
                },
              ],
            ]),
            value: '0x0',
          }
        } else {
          // console.log({ methodName, args })
          return {
            address: routerContract.address,
            calldata: routerContract.interface.encodeFunctionData(methodName, args),
            value,
          }
        }
      })
    }
  }, [
    account,
    allowedSlippage,
    archerETHTip,
    argentWalletContract,
    chainId,
    deadline,
    library,
    factoryContract,
    recipient,
    routerContract,
    trade,
    useArcher,
  ])
}

/**
 * This is hacking out the revert reason from the ethers provider thrown error however it can.
 * This object seems to be undocumented by ethers.
 * @param error an error from the ethers provider
 */
export function swapErrorToUserReadableMessage(error: any): string {
  let reason: string | undefined

  while (Boolean(error)) {
    reason = error.reason ?? error.message ?? reason
    error = error.error ?? error.data?.originalError
  }

  if (reason?.indexOf('execution reverted: ') === 0) reason = reason.substr('execution reverted: '.length)

  switch (reason) {
    case 'UniswapV2Router: EXPIRED':
      return t`The transaction could not be sent because the deadline has passed. Please check that your transaction deadline is not too low.`
    case 'UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT':
    case 'UniswapV2Router: EXCESSIVE_INPUT_AMOUNT':
      return t`This transaction will not succeed either due to price movement or fee on transfer. Try increasing your slippage tolerance.`
    case 'TransferHelper: TRANSFER_FROM_FAILED':
      return t`The input token cannot be transferred. There may be an issue with the input token.`
    case 'UniswapV2: TRANSFER_FAILED':
      return t`The output token cannot be transferred. There may be an issue with the output token.`
    case 'UniswapV2: K':
      return t`The Uniswap invariant x*y=k was not satisfied by the swap. This usually means one of the tokens you are swapping incorporates custom behavior on transfer.`
    case 'Too little received':
    case 'Too much requested':
    case 'STF':
      return t`This transaction will not succeed due to price movement. Try increasing your slippage tolerance.`
    case 'TF':
      return t`The output token cannot be transferred. There may be an issue with the output token.`
    default:
      if (reason?.indexOf('undefined is not an object') !== -1) {
        console.error(error, reason)
        return t`An error occurred when trying to execute this swap. You may need to increase your slippage tolerance. If that does not work, there may be an incompatibility with the token you are trading. Note fee on transfer and rebase tokens are incompatible with Uniswap V3.`
      }
      return t`Unknown error${reason ? `: "${reason}"` : ''}. Try increasing your slippage tolerance.`
  }
}

// returns a function that will execute a swap, if the parameters are all valid
// and the user has approved the slippage adjusted input amount for the trade
export function useSwapCallback(
  trade: V2Trade<Currency, Currency, TradeType> | undefined, // trade to execute, required
  allowedSlippage: Percent, // in bips
  recipientAddressOrName: string | null, // the ENS name or address of the recipient of the trade, or null if swap should be returned to sender
  signatureData: SignatureData | undefined | null,
  archerRelayDeadline?: number // deadline to use for archer relay -- set to undefined for no relay
): {
  state: SwapCallbackState
  callback: null | (() => Promise<string | { txHash: string; preventedLoss: string | undefined }>)
  error: string | null
} {
  const { account, chainId, library } = useActiveWeb3React()

  const blockNumber = useBlockNumber()

  const eip1559 =
    EIP_1559_ACTIVATION_BLOCK[chainId] == undefined ? false : blockNumber >= EIP_1559_ACTIVATION_BLOCK[chainId]

  const useArcher = archerRelayDeadline !== undefined

  const swapCalls = useSwapCallArguments(trade, allowedSlippage, recipientAddressOrName, signatureData, useArcher)

  // console.log({ swapCalls, trade })

  const addTransaction = useTransactionAdder()

  const { address: recipientAddress } = useENS(recipientAddressOrName)

  const recipient = recipientAddressOrName === null ? account : recipientAddress

  const [archerETHTip] = useUserArcherETHTip()

  const [userConveyorUseRelay] = useUserConveyorUseRelay()

  const router = useConveyorRouterContract()

  const transactionDeadline = useTransactionDeadline()

  return useMemo(() => {
    if (!trade || !library || !account || !chainId) {
      return {
        state: SwapCallbackState.INVALID,
        callback: null,
        error: 'Missing dependencies',
      }
    }
    if (!recipient) {
      if (recipientAddressOrName !== null) {
        return {
          state: SwapCallbackState.INVALID,
          callback: null,
          error: 'Invalid recipient',
        }
      } else {
        return {
          state: SwapCallbackState.LOADING,
          callback: null,
          error: null,
        }
      }
    }

    const defaultSushiCallback = {
      state: SwapCallbackState.VALID,
      callback: async function onSwap(): Promise<string> {
        const estimatedCalls: SwapCallEstimate[] = await Promise.all(
          swapCalls.map((call) => {
            const { address, calldata, value } = call

            const tx =
              !value || isZero(value)
                ? { from: account, to: address, data: calldata }
                : {
                    from: account,
                    to: address,
                    data: calldata,
                    value,
                  }

            // console.log('Estimate gas for valid swap')

            // library.getGasPrice().then((gasPrice) => console.log({ gasPrice }))

            return library
              .estimateGas(tx)
              .then((gasEstimate) => {
                return {
                  call,
                  gasEstimate,
                }
              })
              .catch((gasError) => {
                console.log('gasError: ', gasError)
                console.debug('Gas estimate failed, trying eth_call to extract error', call)

                return library
                  .call(tx)
                  .then((result) => {
                    console.debug('Unexpected successful call after failed estimate gas', call, gasError, result)
                    return {
                      call,
                      error: new Error('Unexpected issue with estimating the gas. Please try again.'),
                    }
                  })
                  .catch((callError) => {
                    console.debug('Call threw error', call, callError)
                    return {
                      call,
                      error: new Error(swapErrorToUserReadableMessage(callError)),
                    }
                  })
              })
          })
        )

        // a successful estimation is a bignumber gas estimate and the next call is also a bignumber gas estimate
        let bestCallOption: SuccessfulCall | SwapCallEstimate | undefined = estimatedCalls.find(
          (el, ix, list): el is SuccessfulCall =>
            'gasEstimate' in el && (ix === list.length - 1 || 'gasEstimate' in list[ix + 1])
        )

        // check if any calls errored with a recognizable error
        if (!bestCallOption) {
          const errorCalls = estimatedCalls.filter((call): call is FailedCall => 'error' in call)
          if (errorCalls.length > 0) throw errorCalls[errorCalls.length - 1].error
          const firstNoErrorCall = estimatedCalls.find<SwapCallEstimate>(
            (call): call is SwapCallEstimate => !('error' in call)
          )
          if (!firstNoErrorCall) throw new Error('Unexpected error. Could not estimate gas for the swap.')
          bestCallOption = firstNoErrorCall
        }

        const {
          call: { address, calldata, value },
        } = bestCallOption

        // console.log({ bestCallOption })

        if (!useArcher) {
          console.log('SWAP WITHOUT ARCHER')
          console.log(
            'gasEstimate' in bestCallOption ? { gasLimit: calculateGasMargin(bestCallOption.gasEstimate) } : {}
          )
          return library
            .getSigner()
            .sendTransaction({
              from: account,
              to: address,
              data: calldata,
              // let the wallet try if we can't estimate the gas
              ...('gasEstimate' in bestCallOption ? { gasLimit: calculateGasMargin(bestCallOption.gasEstimate) } : {}),
              gasPrice: !eip1559 && chainId === ChainId.HARMONY ? BigNumber.from('2000000000') : undefined,
              ...(value && !isZero(value) ? { value } : {}),
            })
            .then((response) => {
              const inputSymbol = trade.inputAmount.currency.symbol
              const outputSymbol = trade.outputAmount.currency.symbol
              const inputAmount = trade.inputAmount.toSignificant(4)
              const outputAmount = trade.outputAmount.toSignificant(4)

              const base = `Swap ${inputAmount} ${inputSymbol} for ${outputAmount} ${outputSymbol}`
              const withRecipient =
                recipient === account
                  ? base
                  : `${base} to ${
                      recipientAddressOrName && isAddress(recipientAddressOrName)
                        ? shortenAddress(recipientAddressOrName)
                        : recipientAddressOrName
                    }`

              addTransaction(response, {
                summary: withRecipient,
              })

              return response.hash
            })
            .catch((error) => {
              // if the user rejected the tx, pass this along
              if (error?.code === 4001) {
                throw new Error('Transaction rejected.')
              } else {
                // otherwise, the error was unexpected and we need to convey that
                console.error(`Swap failed`, error, address, calldata, value)

                throw new Error(`Swap failed: ${swapErrorToUserReadableMessage(error)}`)
              }
            })
        } else {
          const postToRelay = (rawTransaction: string, deadline: number) => {
            // as a wise man on the critically acclaimed hit TV series "MTV's Cribs" once said:
            // "this is where the magic happens"
            const relayURI = chainId ? ARCHER_RELAY_URI[chainId] : undefined
            if (!relayURI) throw new Error('Could not determine relay URI for this network')
            const body = JSON.stringify({
              method: 'archer_submitTx',
              tx: rawTransaction,
              deadline: deadline.toString(),
            })
            return fetch(relayURI, {
              method: 'POST',
              body,
              headers: {
                Authorization: process.env.NEXT_PUBLIC_ARCHER_API_KEY ?? '',
                'Content-Type': 'application/json',
              },
            }).then((res) => {
              if (res.status !== 200) throw Error(res.statusText)
            })
          }

          const isMetamask = library.provider.isMetaMask

          if (isMetamask) {
            // ethers will change eth_sign to personal_sign if it detects metamask
            // https://github.com/ethers-io/ethers.js/blob/2a7dbf05718e29e550f7a208d35a095547b9ccc2/packages/providers/src.ts/web3-provider.ts#L33

            library.provider.isMetaMask = false
          }

          const fullTxPromise = library.getBlockNumber().then((blockNumber) => {
            return library.getSigner().populateTransaction({
              from: account,
              to: address,
              data: calldata,
              // let the wallet try if we can't estimate the gas
              ...('gasEstimate' in bestCallOption ? { gasLimit: calculateGasMargin(bestCallOption.gasEstimate) } : {}),
              ...(value && !isZero(value) ? { value } : {}),
              ...(archerRelayDeadline && !eip1559 ? { gasPrice: 0 } : {}),
            })
          })

          let signedTxPromise: Promise<{ signedTx: string; fullTx: TransactionRequest }>
          if (isMetamask) {
            signedTxPromise = fullTxPromise.then((fullTx) => {
              // metamask doesn't support Signer.signTransaction, so we have to do all this manually
              const chainNames: {
                [chainId in ChainId]?: string
              } = {
                [ChainId.MAINNET]: 'mainnet',
              }
              const chain = chainNames[chainId]
              if (!chain) throw new Error(`Unknown chain ID ${chainId} when building transaction`)
              const common = new Common({
                chain,
                hardfork: 'berlin',
              })
              const txParams = {
                nonce:
                  fullTx.nonce !== undefined
                    ? hexlify(fullTx.nonce, {
                        hexPad: 'left',
                      })
                    : undefined,
                gasPrice: fullTx.gasPrice !== undefined ? hexlify(fullTx.gasPrice, { hexPad: 'left' }) : undefined,
                gasLimit: fullTx.gasLimit !== undefined ? hexlify(fullTx.gasLimit, { hexPad: 'left' }) : undefined,
                to: fullTx.to,
                value:
                  fullTx.value !== undefined
                    ? hexlify(fullTx.value, {
                        hexPad: 'left',
                      })
                    : undefined,
                data: fullTx.data?.toString(),
                chainId: fullTx.chainId !== undefined ? hexlify(fullTx.chainId) : undefined,
                type: fullTx.type !== undefined ? hexlify(fullTx.type) : undefined,
              }
              const tx: any = TransactionFactory.fromTxData(txParams, {
                common,
              })
              const unsignedTx = tx.getMessageToSign()
              // console.log('unsignedTx', unsignedTx)

              return library.provider
                .request({ method: 'eth_sign', params: [account, hexlify(unsignedTx)] })
                .then((signature) => {
                  const signatureParts = splitSignature(signature)
                  // really crossing the streams here
                  // eslint-disable-next-line
                  // @ts-ignore
                  const txWithSignature = tx._processSignature(
                    signatureParts.v,
                    arrayify(signatureParts.r),
                    arrayify(signatureParts.s)
                  )
                  return {
                    signedTx: hexlify(txWithSignature.serialize()),
                    fullTx,
                  }
                })
            })
          } else {
            signedTxPromise = fullTxPromise.then((fullTx) => {
              return library
                .getSigner()
                .signTransaction(fullTx)
                .then((signedTx) => {
                  return { signedTx, fullTx }
                })
            })
          }

          return signedTxPromise
            .then(({ signedTx, fullTx }) => {
              const hash = keccak256(signedTx)
              const inputSymbol = trade.inputAmount.currency.symbol
              const outputSymbol = trade.outputAmount.currency.symbol
              const inputAmount = trade.inputAmount.toSignificant(3)
              const outputAmount = trade.outputAmount.toSignificant(3)
              const base = `Swap ${inputAmount} ${inputSymbol} for ${outputAmount} ${outputSymbol}`
              const withRecipient =
                (recipient === account
                  ? base
                  : `${base} to ${
                      recipientAddressOrName && isAddress(recipientAddressOrName)
                        ? shortenAddress(recipientAddressOrName)
                        : recipientAddressOrName
                    }`) + (archerRelayDeadline ? ' 🏹' : '')
              const archer =
                useArcher && archerRelayDeadline
                  ? {
                      rawTransaction: signedTx,
                      deadline: Math.floor(archerRelayDeadline + new Date().getTime() / 1000),
                      nonce: BigNumber.from(fullTx.nonce).toNumber(),
                      ethTip: archerETHTip,
                    }
                  : undefined
              // console.log('archer', archer)
              addTransaction(
                { hash },
                {
                  summary: withRecipient,
                  archer,
                }
              )
              return archer ? postToRelay(archer.rawTransaction, archer.deadline).then(() => hash) : hash
            })
            .catch((error: any) => {
              // if the user rejected the tx, pass this along
              if (error?.code === 4001) {
                throw new Error('Transaction rejected.')
              } else {
                // otherwise, the error was unexpected and we need to convey that
                console.error(`Swap failed`, error)
                throw new Error(`Swap failed: ${error.message}`)
              }
            })
            .finally(() => {
              if (isMetamask) library.provider.isMetaMask = true
            })
        }
      },
      error: null,
    }

    const conveyorCallback = {
      state: SwapCallbackState.VALID,
      // return a transaction hash or return the error
      callback: async (): Promise<{ txHash: string; preventedLoss: string | undefined }> => {
        /**
         * Parse amount of input and output to their raw format
         * @param amounts Array of CurrencyAmounts
         * @returns Array of raw amounts
         */
        const getRawAmounts = (amounts: CurrencyAmount<Currency>[]): string[] => {
          const input = amounts[0].toFixed(amounts[0].currency.decimals)
          const output = amounts[1].toFixed(amounts[1].currency.decimals)

          return [input, output].map((amount, index) => {
            const dotIndex = amount.indexOf('.')
            if (dotIndex === -1) {
              if (index === 0) {
                throw new Error('Failed to parse input amount to its raw format')
              } else if (index === 1) {
                throw new Error('Failed to parse output amount to its raw format')
              }
            }

            return `${amount.substring(0, dotIndex)}${amount.substring(dotIndex + 1)}`
          })
        }

        const user = await router.signer.getAddress()
        // console.log('user: ', { user, account, userEqualsAccount: user === account })
        if (user !== account) {
          throw new Error('Wrong sender')
        }

        const methodName =
          trade.tradeType === TradeType.EXACT_INPUT ? 'swapExactTokensForTokens' : 'swapTokensForExactTokens'
        // console.log('methodName: ', methodName)
        if (methodName !== 'swapExactTokensForTokens') {
          if (methodName === 'swapTokensForExactTokens') {
            throw new Error('Does not support setting output amount')
          } else {
            throw new Error('Can only between ERC-20 tokens')
          }
        }

        const [amount0, amount1] = getRawAmounts([trade.inputAmount, trade.outputAmount])
        // console.log('amount0, amount1: ', amount0, amount1)

        const path = trade.route.path.map((r: Token | WrappedTokenInfo) =>
          r instanceof Token ? r.address : r.tokenInfo.address
        )
        // console.log('path: ', path)

        // We don't need trusted pair anymore in v2
        // for (var i = 0; i < path.length - 1; i++) {
        //   const tokenA = new Token(chainId, path[i], trade.route.path[i].decimals)
        //   const tokenB = new Token(chainId, path[i + 1], trade.route.path[i + 1].decimals)
        //   const pairAddress = Pair.getAddress(tokenA, tokenB)
        //   var isTrustedPair: boolean = false
        //   if (chainId === ChainId.BSCMAIN || chainId === ChainId.BSCTEST) {
        //     isTrustedPair = await controller.isTrustedPancakeV2Pair(pairAddress)
        //   } else {
        //     isTrustedPair = await controller.isTrustedPair(pairAddress)
        //   }
        //   if (!isTrustedPair) {
        //     throw new Error('Not trusted pair!')
        //   }
        // }

        const nonce: BigNumber = await router.nonces(account)
        // console.log('nonce: ', nonce)

        const gasPrice = await library?.getGasPrice()
        const gasLimit = SWAP_GAS_LIMIT + (path.length - 2) * HOP_ADDITIONAL_GAS
        const feeOnTokenA = await calculateConveyorFeeOnToken(
          chainId,
          path[0],
          trade.inputAmount.currency.decimals,
          gasPrice === undefined ? undefined : gasPrice.mul(gasLimit)
        )
        // console.log('fee: ', {gasPrice, gasLimit, feeOnTokenA})

        const EIP712Domain = [
          { name: 'name', type: 'string' },
          { name: 'version', type: 'string' },
          { name: 'chainId', type: 'uint256' },
          { name: 'verifyingContract', type: 'address' },
        ]

        const Forwarder = [
          { name: 'from', type: 'address' },
          { name: 'feeToken', type: 'address' },
          { name: 'maxTokenAmount', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'data', type: 'bytes' },
          { name: 'hashedPayload', type: 'bytes32' },
        ]

        // const Swap = [
        //   { name: 'amount0', type: 'uint256' },
        //   { name: 'amount1', type: 'uint256' },
        //   { name: 'path', type: 'address[]' },
        //   { name: 'user', type: 'address' },
        //   { name: 'deadline', type: 'uint256' },
        // ]

        const domain = {
          name: 'ConveyorV2',
          version: '1',
          chainId: BigNumber.from(chainId).toHexString(),
          verifyingContract: CONVEYOR_V2_ROUTER_ADDRESS[chainId],
        }

        const payload = {
          amount0: BigNumber.from(amount0).toHexString(),
          amount1: BigNumber.from(amount1).toHexString(),
          path,
          user,
          deadline: transactionDeadline.toHexString(),
        }

        const fnData = [
          'function swapExactTokensForTokens(uint256 amount0,uint256 amount1,address[] path,address user,uint256 deadline)',
        ]
        const fnDataIface = new EthInterface(fnData)

        const message = {
          from: user,
          feeToken: path[0],
          maxTokenAmount: BigNumber.from(feeOnTokenA.toFixed(0)).toHexString(),
          deadline: transactionDeadline.toHexString(),
          nonce: nonce.toHexString(),
          data: fnDataIface.functions.swapExactTokensForTokens.encode(
            Object.entries(payload).map(([_, value]) => value)
          ),
          hashedPayload: keccak256(
            defaultAbiCoder.encode(
              ['bytes', 'uint256', 'uint256', 'bytes32', 'address', 'uint256'],
              [
                keccak256(
                  toUtf8Bytes(
                    'swapExactTokensForTokens(uint256 amount0,uint256 amount1,address[] path,address user,uint256 deadline)'
                  )
                ),
                payload.amount0,
                payload.amount1,
                keccak256(solidityPack(['address[]'], [payload.path])),
                payload.user,
                payload.deadline,
              ]
            )
          ),
          // feeAmount: BigNumber.from(feeOnTokenA.toFixed(0)).toHexString(),
        }
        console.log('message', message)

        const EIP712Msg = {
          types: {
            EIP712Domain,
            Forwarder,
            // Swap,
          },
          domain,
          primaryType: 'Forwarder',
          message,
        }
        // console.log('EIP712Msg: ', EIP712Msg)

        const data = JSON.stringify(EIP712Msg)
        // console.log('data: ', data)

        const signature = await library.send('eth_signTypedData_v4', [user, data])
        const { v, r, s } = splitSignature(signature)

        const params = [chainId, EIP712Msg, v.toString(), r, s]
        // console.log('params:', params)

        const jsonrpcRequest = {
          jsonrpc: '2.0',
          // method: '/v2/' + methodName,
          method: `/v2/metaTx/${methodName}`,
          id: 1,
          params,
        }
        // console.log('jsonrpcRequest: ', jsonrpcRequest)

        const requestOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(jsonrpcRequest),
        }

        const response = await fetch(CONVEYOR_RELAYER_URI[chainId]!, requestOptions)
        const { result } = await response.json()

        console.log('result', result)

        // We don't need gToken anymore in v2
        // const originalInputTokenSymbol = trade.inputAmount.currency.symbol?.startsWith('g')
        //   ? trade.inputAmount.currency.symbol.substring(1)
        //   : trade.inputAmount.currency.symbol
        // const originalOutputTokenSymbol = trade.outputAmount.currency.symbol?.startsWith('g')
        //   ? trade.outputAmount.currency.symbol.substring(1)
        //   : trade.outputAmount.currency.symbol
        const originalInputTokenSymbol = trade.inputAmount.currency.symbol
        const originalOutputTokenSymbol = trade.outputAmount.currency.symbol

        if (result.success === true) {
          addTransaction(
            { hash: result.txnHash },
            {
              summary: `Swap ${trade.inputAmount.toSignificant(
                3
              )} ${originalInputTokenSymbol} to ${originalOutputTokenSymbol}`,
            }
          )

          let receipt = null
          while (receipt === null) {
            receipt = await library.getTransactionReceipt(result.txnHash)
          }

          const transactionLogs = receipt.logs
          let savedLoss: JSBigNumber | undefined = undefined
          let lastUsedLogIndex: number = -1
          for (let log of transactionLogs) {
            //if this trade is a multihop trade, we should use the last SWAP event data
            if (
              log.topics[0] === '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822' &&
              log.logIndex > lastUsedLogIndex
            ) {
              const iface = new Interface([
                'event Swap(address indexed sender,uint amount0In,uint amount1In,uint amount0Out,uint amount1Out,address indexed to)',
              ])
              const logDescription = iface.parseLog(log)
              const amount1Out: JSBigNumber = new JSBigNumber(logDescription.args.amount1Out.toString())
              const amount0Out: JSBigNumber = new JSBigNumber(logDescription.args.amount0Out.toString())
              const amountOut = amount1Out.eq(0) ? amount0Out : amount1Out
              const minAmountOut: JSBigNumber = new JSBigNumber(amount1 as string, 16)
              savedLoss = amountOut.minus(minAmountOut)
              lastUsedLogIndex = log.logIndex
            }
          }

          let preventedLoss: string | undefined = undefined
          if (savedLoss !== undefined) {
            preventedLoss =
              savedLoss.div(new JSBigNumber(10).pow(trade.outputAmount.currency.decimals)).toPrecision(6) +
              ' ' +
              originalOutputTokenSymbol
          }
          return { txHash: result.txnHash, preventedLoss: preventedLoss }
        } else {
          throw new Error(result.errorMessage)
        }
      },
      error: null,
    }

    return !userConveyorUseRelay ? defaultSushiCallback : conveyorCallback
  }, [
    trade,
    library,
    account,
    chainId,
    recipient,
    recipientAddressOrName,
    swapCalls,
    useArcher,
    userConveyorUseRelay,
    addTransaction,
  ])
}
