import { Currency, ETHER, Pair, Token } from '@im33357/uniswap-v2-sdk'
import React, { useState, useContext, useCallback, useEffect } from 'react'
import styled, { ThemeContext } from 'styled-components'
import { darken } from 'polished'
import { useCurrencyBalance, useCurrencyBalanceState } from '../../state/wallet/hooks'
import CurrencySearchModal from '../SearchModal/CurrencySearchModal'
import CurrencyLogo from '../CurrencyLogo'
import DoubleCurrencyLogo from '../DoubleLogo'
import { RowBetween } from '../Row'
import { LinkStyledButton, TYPE } from '../../theme'
import { Input as NumericalInput } from '../NumericalInput'
import { ReactComponent as DropDown } from '../../assets/images/dropdown.svg'

import { useActiveWeb3React } from '../../hooks'
import { useTranslation } from 'react-i18next'
import { NATIVE_SYMBOL } from '../../constants/ethernova'
import { switchToEthernova } from '../../utils/ethernovaNetwork'
import { emitDebug } from '../../utils/debugEvents'

const InputRow = styled.div<{ selected: boolean }>`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  padding: ${({ selected }) => (selected ? '0.75rem 0.5rem 0.75rem 1rem' : '0.75rem 0.75rem 0.75rem 1rem')};
`

const CurrencySelect = styled.button<{ selected: boolean }>`
  align-items: center;
  height: 2.2rem;
  font-size: 20px;
  font-weight: 500;
  background-color: ${({ selected, theme }) => (selected ? theme.bg1 : theme.primary1)};
  color: ${({ selected, theme }) => (selected ? theme.text1 : theme.white)};
  border-radius: 12px;
  box-shadow: ${({ selected }) => (selected ? 'none' : '0px 6px 10px rgba(0, 0, 0, 0.075)')};
  outline: none;
  cursor: pointer;
  user-select: none;
  border: none;
  padding: 0 0.5rem;

  :focus,
  :hover {
    background-color: ${({ selected, theme }) => (selected ? theme.bg2 : darken(0.05, theme.primary1))};
  }
`

const LabelRow = styled.div`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: center;
  color: ${({ theme }) => theme.text1};
  font-size: 0.75rem;
  line-height: 1rem;
  padding: 0.75rem 1rem 0 1rem;
  span:hover {
    cursor: pointer;
    color: ${({ theme }) => darken(0.2, theme.text2)};
  }
`

const Aligner = styled.span`
  display: flex;
  align-items: center;
  justify-content: space-between;
`

const StyledDropDown = styled(DropDown)<{ selected: boolean }>`
  margin: 0 0.25rem 0 0.5rem;
  height: 35%;

  path {
    stroke: ${({ selected, theme }) => (selected ? theme.text1 : theme.white)};
    stroke-width: 1.5px;
  }
`

const InputPanel = styled.div<{ hideInput?: boolean }>`
  ${({ theme }) => theme.flexColumnNoWrap}
  position: relative;
  border-radius: ${({ hideInput }) => (hideInput ? '8px' : '20px')};
  background-color: ${({ theme }) => theme.bg2};
  z-index: 1;
`

const Container = styled.div<{ hideInput: boolean }>`
  border-radius: ${({ hideInput }) => (hideInput ? '8px' : '20px')};
  border: 1px solid ${({ theme }) => theme.bg2};
  background-color: ${({ theme }) => theme.bg1};
`

const StyledTokenName = styled.span<{ active?: boolean }>`
  ${({ active }) => (active ? '  margin: 0 0.25rem 0 0.75rem;' : '  margin: 0 0.25rem 0 0.25rem;')}
  font-size:  ${({ active }) => (active ? '20px' : '16px')};

`

const StyledBalanceMax = styled.button<{ disabled?: boolean }>`
  height: 28px;
  background-color: ${({ theme }) => theme.primary5};
  border: 1px solid ${({ theme }) => theme.primary5};
  border-radius: 0.5rem;
  font-size: 0.875rem;

  font-weight: 500;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  margin-right: 0.5rem;
  color: ${({ theme }) => theme.primaryText1};
  opacity: ${({ disabled }) => (disabled ? 0.6 : 1)};
  :hover {
    border: 1px solid ${({ theme, disabled }) => (disabled ? theme.primary5 : theme.primary1)};
  }
  :focus {
    border: 1px solid ${({ theme, disabled }) => (disabled ? theme.primary5 : theme.primary1)};
    outline: none;
  }

  ${({ theme }) => theme.mediaWidth.upToExtraSmall`
    margin-right: 0.5rem;
  `};
`

interface CurrencyInputPanelProps {
  value: string
  onUserInput: (value: string) => void
  onMax?: () => void
  showMaxButton: boolean
  label?: string
  onCurrencySelect?: (currency: Currency) => void
  currency?: Currency | null
  disableCurrencySelect?: boolean
  hideBalance?: boolean
  pair?: Pair | null
  hideInput?: boolean
  otherCurrency?: Currency | null
  id: string
  showCommonBases?: boolean
}

export default function CurrencyInputPanel({
  value,
  onUserInput,
  onMax,
  showMaxButton,
  label = 'Input',
  onCurrencySelect,
  currency,
  disableCurrencySelect = false,
  hideBalance = false,
  pair = null, // used for double token logo
  hideInput = false,
  otherCurrency,
  id,
  showCommonBases
}: CurrencyInputPanelProps) {
  const { t } = useTranslation()

  const [modalOpen, setModalOpen] = useState(false)
  const { account } = useActiveWeb3React()
  const selectedCurrencyBalance = useCurrencyBalance(account ?? undefined, currency ?? undefined)
  const balanceState = useCurrencyBalanceState(account ?? undefined, currency ?? undefined)
  const effectiveBalance = balanceState.balance ?? selectedCurrencyBalance
  const wrongNetwork = balanceState.status === 'wrong_network'
  const showBalanceError = balanceState.status === 'unavailable'
  const showBalanceLoading = balanceState.status === 'loading'
  const theme = useContext(ThemeContext)
  const displaySymbol = currency === ETHER ? NATIVE_SYMBOL : currency?.symbol
  const debugEnabled = typeof window !== 'undefined' && window.location.search.includes('debug=1')

  useEffect(() => {
    if (!debugEnabled || !currency) return
    emitDebug({
      lastAction: {
        name: 'MAX_BALANCE_STATE',
        time: new Date().toISOString(),
        meta: {
          field: id ?? null,
          chainId: currency instanceof Token ? currency.chainId : null,
          currency: {
            symbol: currency.symbol,
            address: currency instanceof Token ? currency.address : null,
            isNative: currency === ETHER
          },
          balanceLoaded: balanceState.status === 'ok',
          balanceExact: balanceState.balance?.toExact?.() ?? null,
          balanceRaw: balanceState.balance?.quotient?.toString?.() ?? null,
          error: balanceState.error ?? null
        }
      }
    })
  }, [debugEnabled, id, currency, balanceState.status, balanceState.balance, balanceState.error])

  const handleDismissSearch = useCallback(() => {
    setModalOpen(false)
  }, [setModalOpen])

  return (
    <InputPanel id={id}>
      <Container hideInput={hideInput}>
        {!hideInput && (
          <LabelRow>
            <RowBetween>
              <TYPE.body color={theme.text2} fontWeight={500} fontSize={14}>
                {label}
              </TYPE.body>
              {account && (
                <TYPE.body color={theme.text2} fontWeight={500} fontSize={14} style={{ display: 'inline' }}>
                  {!hideBalance && !!currency ? (
                    wrongNetwork ? (
                      <>
                        Wrong network{' '}
                        <LinkStyledButton onClick={() => switchToEthernova().catch(() => undefined)}>
                          Switch to Ethernova
                        </LinkStyledButton>
                      </>
                    ) : showBalanceError ? (
                      <>
                        Balance unavailable (RPC){' '}
                        <LinkStyledButton onClick={balanceState.refresh}>Retry</LinkStyledButton>
                      </>
                    ) : showBalanceLoading ? (
                      <>Balance loading…</>
                    ) : effectiveBalance ? (
                      'Balance: ' + effectiveBalance?.toSignificant(6)
                    ) : (
                      ' -'
                    )
                  ) : (
                    ' -'
                  )}
                </TYPE.body>
              )}
            </RowBetween>
          </LabelRow>
        )}
        <InputRow style={hideInput ? { padding: '0', borderRadius: '8px' } : {}} selected={disableCurrencySelect}>
          {!hideInput && (
            <>
              <NumericalInput
                className="token-amount-input"
                value={value}
                onUserInput={val => {
                  onUserInput(val)
                }}
              />
              {account && currency && showMaxButton && label !== 'To' && (
                <StyledBalanceMax
                  disabled={showBalanceError || showBalanceLoading || wrongNetwork}
                  onClick={() => {
                    if (debugEnabled) {
                      emitDebug({
                        lastAction: {
                          name: 'MAX_CLICK',
                          time: new Date().toISOString(),
                          meta: {
                            field: id ?? null,
                            chainId: currency instanceof Token ? currency.chainId : null,
                            currencySymbol: currency.symbol,
                            currencyAddress: currency instanceof Token ? currency.address : null
                          }
                        }
                      })
                    }
                    if (wrongNetwork) {
                      switchToEthernova().catch(() => undefined)
                      return
                    }
                    if (showBalanceError || showBalanceLoading) {
                      balanceState.refresh()
                      return
                    }
                    onMax && onMax()
                  }}
                >
                  MAX
                </StyledBalanceMax>
              )}
            </>
          )}
          <CurrencySelect
            selected={!!currency}
            className="open-currency-select-button"
            onClick={() => {
              if (!disableCurrencySelect) {
                setModalOpen(true)
              }
            }}
          >
            <Aligner>
              {pair ? (
                <DoubleCurrencyLogo currency0={pair.token0} currency1={pair.token1} size={24} margin={true} />
              ) : currency ? (
                <CurrencyLogo currency={currency} size={'24px'} />
              ) : null}
              {pair ? (
                <StyledTokenName className="pair-name-container">
                  {pair?.token0.symbol}:{pair?.token1.symbol}
                </StyledTokenName>
              ) : (
                <StyledTokenName className="token-symbol-container" active={Boolean(currency && currency.symbol)}>
                  {(displaySymbol && displaySymbol.length > 20
                    ? displaySymbol.slice(0, 4) +
                      '...' +
                      displaySymbol.slice(displaySymbol.length - 5, displaySymbol.length)
                    : displaySymbol) || t('selectToken')}
                </StyledTokenName>
              )}
              {!disableCurrencySelect && <StyledDropDown selected={!!currency} />}
            </Aligner>
          </CurrencySelect>
        </InputRow>
      </Container>
      {!disableCurrencySelect && onCurrencySelect && (
        <CurrencySearchModal
          isOpen={modalOpen}
          onDismiss={handleDismissSearch}
          onCurrencySelect={onCurrencySelect}
          selectedCurrency={currency}
          otherSelectedCurrency={otherCurrency}
          showCommonBases={showCommonBases}
        />
      )}
    </InputPanel>
  )
}
