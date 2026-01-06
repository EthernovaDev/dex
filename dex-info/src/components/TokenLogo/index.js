import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
const DEFAULT_LOGO = `${process.env.PUBLIC_URL || ''}/ethernova.png`
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

const StyledNativeLogo = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;

  > img {
    width: ${({ size }) => size};
    height: ${({ size }) => size};
  }
`

export default function TokenLogo({ address, header = false, size = 'var(--avatar-sm)', ...rest }) {
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
      <StyledNativeLogo size={size} {...rest}>
        <img
          src={DEFAULT_LOGO}
          style={{
            boxShadow: '0px 6px 10px rgba(0, 0, 0, 0.075)',
            borderRadius: '24px',
          }}
          alt=""
        />
      </StyledNativeLogo>
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
          src={DEFAULT_LOGO}
          style={{
            boxShadow: '0px 6px 10px rgba(0, 0, 0, 0.075)',
            borderRadius: '24px',
          }}
          alt=""
        />
      </StyledNativeLogo>
    )
  }

  return (
    <StyledNativeLogo size={size} {...rest}>
      <img
        src={DEFAULT_LOGO}
        style={{
          boxShadow: '0px 6px 10px rgba(0, 0, 0, 0.075)',
          borderRadius: '24px',
        }}
        alt=""
      />
    </StyledNativeLogo>
  )
}
