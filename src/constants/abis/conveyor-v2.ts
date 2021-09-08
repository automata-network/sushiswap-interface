import { CONVEYOR_V2_ROUTER_ADDRESS } from '@sushiswap/sdk'
import CONVEYOR_V2_ROUTER_ABI from './conveyor-v2-router.json'

export { CONVEYOR_V2_ROUTER_ABI, CONVEYOR_V2_ROUTER_ADDRESS }

export const EIP712_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
]

export const FORWARDER_TYPE = [
  { name: 'from', type: 'address' },
  { name: 'feeToken', type: 'address' },
  { name: 'maxTokenAmount', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'data', type: 'bytes' },
  { name: 'hashedPayload', type: 'bytes32' },
]

export const PERMIT_TYPE = [
  { name: 'owner', type: 'address' },
  { name: 'spender', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'nonce', type: 'uint256' },
  { name: 'deadline', type: 'uint256' },
]

export const ADD_LIQUIDITY_TYPE = [
  { name: 'tokenA', type: 'address' },
  { name: 'tokenB', type: 'address' },
  { name: 'amountADesired', type: 'uint256' },
  { name: 'amountBDesired', type: 'uint256' },
  { name: 'amountAMin', type: 'uint256' },
  { name: 'amountBMin', type: 'uint256' },
  { name: 'user', type: 'address' },
  { name: 'deadline', type: 'uint256' },
]

export const REMOVE_LIQUIDITY_TYPE = [
  { name: 'tokenA', type: 'address' },
  { name: 'tokenB', type: 'address' },
  { name: 'liquidity', type: 'uint256' },
  { name: 'amountAMin', type: 'uint256' },
  { name: 'amountBMin', type: 'uint256' },
  { name: 'user', type: 'address' },
  { name: 'deadline', type: 'uint256' },
  { name: 'v', type: 'uint8' },
  { name: 'r', type: 'bytes32' },
  { name: 's', type: 'bytes32' },
]

export const SWAP_TYPE = [
  { name: 'amount0', type: 'uint256' },
  { name: 'amount1', type: 'uint256' },
  { name: 'path', type: 'address[]' },
  { name: 'user', type: 'address' },
  { name: 'deadline', type: 'uint256' },
]
