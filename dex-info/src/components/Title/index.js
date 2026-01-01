import React from 'react'
import { useHistory } from 'react-router-dom'
import styled from 'styled-components'

import { Flex } from 'rebass'
import Link from '../Link'
import { RowFixed } from '../Row'

import { BasicLink } from '../Link'
import { useMedia } from 'react-use'

const TitleWrapper = styled.div`
  text-decoration: none;
  z-index: 10;
  width: 100%;
  &:hover {
    cursor: pointer;
  }
`

const BrandMark = styled(Link)`
  display: flex;
  align-items: center;
  text-decoration: none;
`

const BrandName = styled.div`
  font-size: 1.2rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  background: linear-gradient(90deg, #8b5cf6 0%, #ff4fd8 50%, #4da3ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
`

const BrandSub = styled.div`
  font-size: 0.7rem;
  color: ${({ theme }) => theme.text3};
`

const Option = styled.div`
  font-weight: 500;
  font-size: 14px;
  opacity: ${({ activeText }) => (activeText ? 1 : 0.6)};
  color: ${({ theme }) => theme.white};
  display: flex;
  padding: 4px 2px;
  min-width: 56px;
  margin-left: 12px;
  :hover {
    opacity: 1;
  }
`

const NavRow = styled(RowFixed)`
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 4px;
  z-index: 20;
  pointer-events: auto;
`

export default function Title() {
  const history = useHistory()
  const below1080 = useMedia('(max-width: 1080px)')

  return (
    <TitleWrapper>
      <Flex alignItems="center" style={{ justifyContent: 'space-between' }}>
        <RowFixed>
          <BrandMark id="link" onClick={() => history.push('/')}>
            <div>
              <BrandName>NovaDEX</BrandName>
              <BrandSub>Analytics</BrandSub>
            </div>
          </BrandMark>
        </RowFixed>
        {below1080 && (
          <NavRow onClick={(e) => e.stopPropagation()}>
            <BasicLink to="/home" data-testid="nav-overview">
              <Option activeText={history.location.pathname === '/home' ?? undefined}>Overview</Option>
            </BasicLink>
            <BasicLink to="/tokens" data-testid="nav-tokens">
              <Option
                activeText={
                  (history.location.pathname.split('/')[1] === 'tokens' ||
                    history.location.pathname.split('/')[1] === 'token') ??
                  undefined
                }
              >
                Tokens
              </Option>
            </BasicLink>
            <BasicLink to="/pairs" data-testid="nav-pairs">
              <Option
                activeText={
                  (history.location.pathname.split('/')[1] === 'pairs' ||
                    history.location.pathname.split('/')[1] === 'pair') ??
                  undefined
                }
              >
                Pairs
              </Option>
            </BasicLink>

            <BasicLink to="/accounts" data-testid="nav-accounts">
              <Option
                activeText={
                  (history.location.pathname.split('/')[1] === 'accounts' ||
                    history.location.pathname.split('/')[1] === 'account') ??
                  undefined
                }
              >
                Accounts
              </Option>
            </BasicLink>
          </NavRow>
        )}
      </Flex>
    </TitleWrapper>
  )
}
