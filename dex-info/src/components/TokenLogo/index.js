import React, { useState, useEffect } from 'react'
import styled from 'styled-components'
import NovaLogo from '../../assets/nova.svg'
import { TONY_ADDRESS, WRAPPED_NATIVE_ADDRESS } from '../../constants/urls'

const BAD_IMAGES = {}

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

export default function TokenLogo({ address, header = false, size = '24px', ...rest }) {
  const [error, setError] = useState(false)

  useEffect(() => {
    setError(false)
  }, [address])

  const normalized = address?.toLowerCase()

  if (error || (normalized && BAD_IMAGES[normalized])) {
    return (
      <Inline>
        <span {...rest} alt={''} style={{ fontSize: size }} role="img" aria-label="face">
          🤔
        </span>
      </Inline>
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

  return (
    <Inline>
      <span {...rest} alt={''} style={{ fontSize: size }} role="img" aria-label="token">
        ◼︎
      </span>
    </Inline>
  )
}
