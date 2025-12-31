import { Currency, ETHER, Token } from '@im33357/uniswap-v2-sdk'
import React, { useMemo } from 'react'
import styled from 'styled-components'

import NovaLogo from '../../assets/images/nova.svg'
import useHttpLocations from '../../hooks/useHttpLocations'
import { WrappedTokenInfo } from '../../state/lists/hooks'
import Logo from '../Logo'
import { NATIVE_SYMBOL } from '../../constants/ethernova'
import { TONY_ADDRESS, WNOVA_ADDRESS } from '../../constants/addresses'

const LOCAL_LOGOS: { [address: string]: string } = {
  [WNOVA_ADDRESS.toLowerCase()]: NovaLogo,
  [TONY_ADDRESS.toLowerCase()]: NovaLogo
}

const StyledNativeLogo = styled.img<{ size: string }>`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
  box-shadow: 0px 6px 10px rgba(0, 0, 0, 0.075);
  border-radius: 24px;
`

const StyledLogo = styled(Logo)<{ size: string }>`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
`

export default function CurrencyLogo({
  currency,
  size = '24px',
  style
}: {
  currency?: Currency
  size?: string
  style?: React.CSSProperties
}) {
  const uriLocations = useHttpLocations(currency instanceof WrappedTokenInfo ? currency.logoURI : undefined)

  const srcs: string[] = useMemo(() => {
    if (currency === ETHER) return []
    if (currency instanceof Token) {
      if (currency instanceof WrappedTokenInfo && uriLocations.length) {
        return [...uriLocations]
      }
      const local = LOCAL_LOGOS[currency.address.toLowerCase()]
      return local ? [local] : []
    }
    return []
  }, [currency, uriLocations])

  if (currency === ETHER) {
    return <StyledNativeLogo src={NovaLogo} size={size} style={style} />
  }

  const altSymbol = currency === ETHER ? NATIVE_SYMBOL : currency?.symbol ?? 'token'
  return <StyledLogo size={size} srcs={srcs} alt={`${altSymbol} logo`} style={style} />
}
