import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import NovaLogo from '../../assets/nova.svg'
import { TONY_ADDRESS, WRAPPED_NATIVE_ADDRESS } from '../../constants/urls'
import { useTokenMetadata } from '../../hooks/useTokenMetadata'

const BAD_IMAGES = {}
const IPFS_GATEWAY = process.env.REACT_APP_IPFS_GATEWAY || 'https://dex.ethnova.net/ipfs/'

const resolveLogoUri = (uri) => {
  if (!uri) return null
  if (uri.startsWith('ipfs://')) {
    return `${IPFS_GATEWAY}${uri.slice(7)}`
  }
  return uri
}

const Inline = styled.div`
  display: flex;
  align-items: center;
  align-self: center;
`

const StyledNativeLogo = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;

  > img {
    width: ${({ size }) => size};
    height: ${({ size }) => size};
  }
`

const FallbackLogo = styled.div`
  width: ${({ size }) => size};
  height: ${({ size }) => size};
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: calc(${({ size }) => size} / 2.3);
  color: rgba(255, 255, 255, 0.92);
  background: ${({ $bg }) => $bg};
  border: 1px solid rgba(255, 255, 255, 0.08);
`

const colorFromAddress = (addr) => {
  if (!addr) return 'rgba(148, 163, 184, 0.25)'
  const clean = addr.replace(/^0x/, '')
  const seed = parseInt(clean.slice(0, 6), 16)
  if (!Number.isFinite(seed)) return 'rgba(148, 163, 184, 0.25)'
  const hue = seed % 360
  return `hsl(${hue}, 70%, 40%)`
}

export default function TokenLogo({ address, header = false, size = '24px', ...rest }) {
  const [error, setError] = useState(false)
  const [customLogo, setCustomLogo] = useState(null)
  const remoteMeta = useTokenMetadata(address)

  useEffect(() => {
    setError(false)
    setCustomLogo(null)
    if (typeof window === 'undefined') return
    if (!address) return
    const meta = remoteMeta
    if (meta?.logo || meta?.image_uri) {
      setCustomLogo(resolveLogoUri(meta.logo || meta.image_uri))
    }
  }, [address, remoteMeta])

  const normalized = address?.toLowerCase()

  if (error || (normalized && BAD_IMAGES[normalized])) {
    return (
      <Inline>
        <FallbackLogo size={size} $bg={colorFromAddress(normalized)} {...rest}>
          ?
        </FallbackLogo>
      </Inline>
    )
  }

  if (customLogo) {
    return (
      <StyledNativeLogo size={size} {...rest}>
        <img
          src={customLogo}
          style={{
            boxShadow: '0px 6px 10px rgba(0, 0, 0, 0.075)',
            borderRadius: '24px',
          }}
          onError={() => setError(true)}
          alt=""
        />
      </StyledNativeLogo>
    )
  }

  if (normalized === WRAPPED_NATIVE_ADDRESS || normalized === TONY_ADDRESS) {
    return (
      <StyledNativeLogo size={size} {...rest}>
        <img
          src={NovaLogo}
          style={{
            boxShadow: '0px 6px 10px rgba(0, 0, 0, 0.075)',
            borderRadius: '24px',
          }}
          alt=""
        />
      </StyledNativeLogo>
    )
  }

  const label = normalized ? normalized.slice(2, 4).toUpperCase() : '?'
  return (
    <Inline>
      <FallbackLogo size={size} $bg={colorFromAddress(normalized)} {...rest}>
        {label}
      </FallbackLogo>
    </Inline>
  )
}
