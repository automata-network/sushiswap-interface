import { DEFAULT_ARCHER_ETH_TIP, DEFAULT_ARCHER_GAS_ESTIMATE, DEFAULT_ARCHER_GAS_PRICES } from '../../config/archer'
import {
  DEFAULT_DEADLINE_FROM_NOW,
  INITIAL_ALLOWED_SLIPPAGE,
  SWAP_GAS_LIMIT,
  ADD_LIQUIDITY_GAS_LIMIT,
} from '../../constants'
import {
  SerializedPair,
  SerializedToken,
  addSerializedPair,
  addSerializedToken,
  removeSerializedPair,
  removeSerializedToken,
  toggleURLWarning,
  updateMatchesDarkMode,
  updateUserArcherETHTip,
  updateUserArcherGasEstimate,
  updateUserArcherGasPrice,
  updateUserArcherTipManualOverride,
  updateUserArcherUseRelay,
  updateUserDarkMode,
  updateUserDeadline,
  updateUserExpertMode,
  updateUserSingleHopOnly,
  updateUserSlippageTolerance,
  updateUserConveyorUseRelay,
  updateUserConveyorGasEstimation,
  // updateUserMaxTokenAmount,
  updateUserSwapGasLimit,
  updateUserLiquidityGasLimit,
} from './actions'

import { createReducer } from '@reduxjs/toolkit'
import { updateVersion } from '../global/actions'

const currentTimestamp = () => new Date().getTime()

export interface UserState {
  // the timestamp of the last updateVersion action
  lastUpdateVersionTimestamp?: number

  userDarkMode: boolean | null // the user's choice for dark mode or light mode
  matchesDarkMode: boolean // whether the dark mode media query matches

  userExpertMode: boolean

  userSingleHopOnly: boolean // only allow swaps on direct pairs

  // user defined slippage tolerance in bips, used in all txns
  userSlippageTolerance: number | 'auto'

  // deadline set by user in minutes, used in all txns
  userDeadline: number

  tokens: {
    [chainId: number]: {
      [address: string]: SerializedToken
    }
  }

  pairs: {
    [chainId: number]: {
      // keyed by token0Address:token1Address
      [key: string]: SerializedPair
    }
  }

  timestamp: number
  URLWarningVisible: boolean

  userArcherUseRelay: boolean // use relay or go directly to router
  userArcherGasPrice: string // Current gas price
  userArcherETHTip: string // ETH tip for relay, as full BigInt string
  userArcherGasEstimate: string // Gas estimate for trade
  userArcherTipManualOverride: boolean // is user manually entering tip

  userConveyorUseRelay: boolean
  userConveyorGasEstimation: string

  // userMaxTokenAmount: number
  userSwapGasLimit: number
  userLiquidityGasLimit: number
}

function pairKey(token0Address: string, token1Address: string) {
  return `${token0Address};${token1Address}`
}

export const initialState: UserState = {
  userDarkMode: null,
  matchesDarkMode: false,
  userExpertMode: false,
  userSingleHopOnly: false,
  userSlippageTolerance: INITIAL_ALLOWED_SLIPPAGE,
  userDeadline: DEFAULT_DEADLINE_FROM_NOW,
  tokens: {},
  pairs: {},
  timestamp: currentTimestamp(),
  URLWarningVisible: true,
  userArcherUseRelay: false,
  userArcherGasPrice: DEFAULT_ARCHER_GAS_PRICES[4].toString(),
  userArcherETHTip: DEFAULT_ARCHER_ETH_TIP.toString(),
  userArcherGasEstimate: DEFAULT_ARCHER_GAS_ESTIMATE.toString(),
  userArcherTipManualOverride: false,
  userConveyorUseRelay: false,
  userConveyorGasEstimation: '',
  // userMaxTokenAmount: 12000000,
  userSwapGasLimit: SWAP_GAS_LIMIT,
  userLiquidityGasLimit: ADD_LIQUIDITY_GAS_LIMIT,
}

export default createReducer(initialState, (builder) =>
  builder
    .addCase(updateVersion, (state) => {
      // slippage isnt being tracked in local storage, reset to default
      // noinspection SuspiciousTypeOfGuard
      if (typeof state.userSlippageTolerance !== 'number') {
        state.userSlippageTolerance = INITIAL_ALLOWED_SLIPPAGE
      }

      // deadline isnt being tracked in local storage, reset to default
      // noinspection SuspiciousTypeOfGuard
      if (typeof state.userDeadline !== 'number') {
        state.userDeadline = DEFAULT_DEADLINE_FROM_NOW
      }

      // max token amount isnt being tracked in local storage, reset to default
      // noinspection SuspiciousTypeOfGuard
      // if (typeof state.userMaxTokenAmount !== 'number') {
      //   state.userMaxTokenAmount = 12000000
      // }

      // swap gas limit isnt being tracked in local storage, reset to default
      // noinspection SuspiciousTypeOfGuard
      if (typeof state.userSwapGasLimit !== 'number') {
        state.userSwapGasLimit = SWAP_GAS_LIMIT
      }

      // liquidity gas limit isnt being tracked in local storage, reset to default
      // noinspection SuspiciousTypeOfGuard
      if (typeof state.userLiquidityGasLimit !== 'number') {
        state.userLiquidityGasLimit = ADD_LIQUIDITY_GAS_LIMIT
      }

      state.lastUpdateVersionTimestamp = currentTimestamp()
    })
    .addCase(updateUserDarkMode, (state, action) => {
      state.userDarkMode = action.payload.userDarkMode
      state.timestamp = currentTimestamp()
    })
    .addCase(updateMatchesDarkMode, (state, action) => {
      state.matchesDarkMode = action.payload.matchesDarkMode
      state.timestamp = currentTimestamp()
    })
    .addCase(updateUserExpertMode, (state, action) => {
      state.userExpertMode = action.payload.userExpertMode
      state.timestamp = currentTimestamp()
    })
    .addCase(updateUserSlippageTolerance, (state, action) => {
      state.userSlippageTolerance = action.payload.userSlippageTolerance
      state.timestamp = currentTimestamp()
    })
    .addCase(updateUserDeadline, (state, action) => {
      state.userDeadline = action.payload.userDeadline
      state.timestamp = currentTimestamp()
    })
    .addCase(updateUserSingleHopOnly, (state, action) => {
      state.userSingleHopOnly = action.payload.userSingleHopOnly
    })
    .addCase(addSerializedToken, (state, { payload: { serializedToken } }) => {
      state.tokens[serializedToken.chainId] = state.tokens[serializedToken.chainId] || {}
      state.tokens[serializedToken.chainId][serializedToken.address] = serializedToken
      state.timestamp = currentTimestamp()
    })
    .addCase(removeSerializedToken, (state, { payload: { address, chainId } }) => {
      state.tokens[chainId] = state.tokens[chainId] || {}
      delete state.tokens[chainId][address]
      state.timestamp = currentTimestamp()
    })
    .addCase(addSerializedPair, (state, { payload: { serializedPair } }) => {
      if (
        serializedPair.token0.chainId === serializedPair.token1.chainId &&
        serializedPair.token0.address !== serializedPair.token1.address
      ) {
        const chainId = serializedPair.token0.chainId
        state.pairs[chainId] = state.pairs[chainId] || {}
        state.pairs[chainId][pairKey(serializedPair.token0.address, serializedPair.token1.address)] = serializedPair
      }
      state.timestamp = currentTimestamp()
    })
    .addCase(removeSerializedPair, (state, { payload: { chainId, tokenAAddress, tokenBAddress } }) => {
      if (state.pairs[chainId]) {
        // just delete both keys if either exists
        delete state.pairs[chainId][pairKey(tokenAAddress, tokenBAddress)]
        delete state.pairs[chainId][pairKey(tokenBAddress, tokenAAddress)]
      }
      state.timestamp = currentTimestamp()
    })
    .addCase(toggleURLWarning, (state) => {
      state.URLWarningVisible = !state.URLWarningVisible
    })
    .addCase(updateUserArcherUseRelay, (state, action) => {
      state.userArcherUseRelay = action.payload.userArcherUseRelay
    })
    .addCase(updateUserArcherGasPrice, (state, action) => {
      state.userArcherGasPrice = action.payload.userArcherGasPrice
    })
    .addCase(updateUserArcherETHTip, (state, action) => {
      state.userArcherETHTip = action.payload.userArcherETHTip
    })
    .addCase(updateUserArcherGasEstimate, (state, action) => {
      state.userArcherGasEstimate = action.payload.userArcherGasEstimate
    })
    .addCase(updateUserArcherTipManualOverride, (state, action) => {
      state.userArcherTipManualOverride = action.payload.userArcherTipManualOverride
    })
    .addCase(updateUserConveyorUseRelay, (state, action) => {
      state.userConveyorUseRelay = action.payload.userConveyorUseRelay
      state.timestamp = currentTimestamp()
    })
    .addCase(updateUserConveyorGasEstimation, (state, action) => {
      state.userConveyorGasEstimation = action.payload.userConveyorGasEstimation
    })
    // .addCase(updateUserMaxTokenAmount, (state, action) => {
    //   state.userMaxTokenAmount = action.payload.userMaxTokenAmount
    // })
    .addCase(updateUserSwapGasLimit, (state, action) => {
      state.userSwapGasLimit = action.payload.userSwapGasLimit
      state.timestamp = currentTimestamp()
    })
    .addCase(updateUserLiquidityGasLimit, (state, action) => {
      state.userLiquidityGasLimit = action.payload.userLiquidityGasLimit
      state.timestamp = currentTimestamp()
    })
)
