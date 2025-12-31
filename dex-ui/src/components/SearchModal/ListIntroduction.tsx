import React from 'react'
import { Text } from 'rebass'
import { ButtonPrimary } from '../Button'
import { OutlineCard } from '../Card'
import Column, { AutoColumn } from '../Column'
import { PaddedColumn } from './styleds'
import listDark from '../../assets/images/token-list/lists-dark.png'

export default function ListIntroduction({ onSelectList }: { onSelectList: () => void }) {
  return (
    <Column style={{ width: '100%', flex: '1 1' }}>
      <PaddedColumn>
        <AutoColumn gap="14px">
          <img style={{ width: '120px', margin: '0 auto' }} src={listDark} alt="token-list-preview" />
          <Text style={{ marginBottom: '8px', textAlign: 'center' }}>
            NovaDEX uses a local Ethernova token list. You can import custom tokens by address if needed.
          </Text>
          <ButtonPrimary onClick={onSelectList} id="list-introduction-choose-a-list">
            Choose a list
          </ButtonPrimary>
          <OutlineCard style={{ marginBottom: '8px', padding: '1rem' }}>
            <Text fontWeight={400} fontSize={14} style={{ textAlign: 'center' }}>
              Only Ethernova tokens are shown by default.
            </Text>
          </OutlineCard>
        </AutoColumn>
      </PaddedColumn>
    </Column>
  )
}
