import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom'
import styled from 'styled-components'
import { CloseIcon, TYPE } from '../../theme'
import WrapForm from './WrapForm'
import UnwrapForm from './UnwrapForm'

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  z-index: 10000;
  padding: 16px;
`

const Panel = styled.div`
  width: min(92vw, 420px);
  max-height: 85vh;
  overflow: auto;
  border-radius: 20px;
  background: rgba(10, 12, 20, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 80px rgba(0, 0, 0, 0.55);
  padding: 0;
  display: flex;
  flex-direction: column;
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 0 20px;
`

const Tabs = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  padding: 16px 20px 8px 20px;
`

const TabButton = styled.button<{ active?: boolean }>`
  width: 100%;
  border: 1px solid ${({ theme, active }) => (active ? theme.primary1 : theme.bg4)};
  background-color: ${({ theme, active }) => (active ? theme.primary5 : theme.bg2)};
  color: ${({ theme, active }) => (active ? theme.text1 : theme.text2)};
  padding: 8px 12px;
  border-radius: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 120ms ease;
`

const Body = styled.div`
  padding: 0 20px 20px 20px;
  width: 100%;
  box-sizing: border-box;
`

export default function WrapUnwrapModal({
  isOpen,
  onDismiss,
  initialTab = 'wrap'
}: {
  isOpen: boolean
  onDismiss: () => void
  initialTab?: 'wrap' | 'unwrap'
}) {
  const [tab, setTab] = useState<'wrap' | 'unwrap'>(initialTab)

  useEffect(() => {
    if (isOpen) setTab(initialTab)
  }, [initialTab, isOpen])

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, onDismiss])

  if (!isOpen) return null
  if (typeof document === 'undefined') return null

  const modal = (
    <Overlay onClick={onDismiss}>
      <Panel onClick={event => event.stopPropagation()}>
        <Header>
          <TYPE.mediumHeader>Wrap / Unwrap</TYPE.mediumHeader>
          <CloseIcon onClick={onDismiss} />
        </Header>
        <Tabs>
          <TabButton active={tab === 'wrap'} onClick={() => setTab('wrap')}>
            Wrap
          </TabButton>
          <TabButton active={tab === 'unwrap'} onClick={() => setTab('unwrap')}>
            Unwrap
          </TabButton>
        </Tabs>
        <Body>{tab === 'wrap' ? <WrapForm /> : <UnwrapForm />}</Body>
      </Panel>
    </Overlay>
  )

  return ReactDOM.createPortal(modal, document.body)
}
