import { Currency, Price } from '@sushiswap/sdk'
import React, { useCallback } from 'react'

import Typography from '../../components/Typography'
import { classNames } from '../../functions'
import { t } from '@lingui/macro'
import { useLingui } from '@lingui/react'
import BigNumber from 'bignumber.js'

interface ConveyorGasFeeProps {
  gasFee: string
  inputSymbol: string
  className?: string
}

export default function ConveyorGasFee({ gasFee, inputSymbol, className }: ConveyorGasFeeProps) {
  const { i18n } = useLingui()

  let formattedGasFee: BigNumber | string

  try {
    formattedGasFee = new BigNumber(gasFee).toPrecision(6)
  } catch (error) {
    formattedGasFee = '0'
  }

  return (
    <>
      {gasFee && (
        <div className={classNames('flex justify-between w-full px-5 py-1 rounded-b-md text-secondary', className)}>
          <Typography variant="sm" className="select-none">
            {i18n._(t`Gas fee to be deducted`)}
          </Typography>
          <div className="flex items-center space-x-4">
            <Typography variant="sm" className="select-none">
              {`+ ${formattedGasFee} ${inputSymbol}`}
            </Typography>
          </div>
        </div>
      )}
    </>
  )
}
