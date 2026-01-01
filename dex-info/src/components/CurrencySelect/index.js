import React from 'react'
import styled from 'styled-components'

import { useCurrentCurrency } from '../../contexts/Application'

import Row from '../Row'
import { ChevronDown as Arrow } from 'react-feather'

const Select = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  width: fit-content;
  height: 38px;
  border-radius: 20px;
  font-weight: 500;
  font-size: 1rem;
  color: ${({ theme }) => theme.textColor};

  :hover {
    cursor: pointer;
  }

  @media screen and (max-width: 40em) {
    display: none;
  }
`

const ArrowStyled = styled(Arrow)`
  height: 20px;
  width: 20px;
  margin-left: 6px;
`

const CurrencySelect = () => {
  const [currency] = useCurrentCurrency()

  return (
    <>
      <Select>
        <Row>
          {currency} <ArrowStyled />
        </Row>
      </Select>
    </>
  )
}

export default CurrencySelect
