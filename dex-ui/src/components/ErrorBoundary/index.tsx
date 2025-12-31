import React from 'react'
import styled from 'styled-components'
import { reportRuntimeCrash } from '../../utils/runtimeDiagnostics'

const BUILD_STAMP = process.env.REACT_APP_BUILD_STAMP ?? 'unknown'
const AUTO_RELOAD_KEY = 'novadex-auto-reload'

const Wrapper = styled.div`
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  padding: 32px 20px;
  color: rgba(255, 255, 255, 0.9);
  background: radial-gradient(1200px 800px at 10% -10%, rgba(139, 92, 246, 0.2) 0%, transparent 60%),
    radial-gradient(900px 700px at 95% 5%, rgba(255, 79, 216, 0.2) 0%, transparent 60%),
    radial-gradient(800px 700px at 50% 120%, rgba(77, 163, 255, 0.2) 0%, transparent 60%),
    #0b0f1a;
`

const Title = styled.h1`
  font-size: 28px;
  margin-bottom: 12px;
`

const Subtitle = styled.p`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
  max-width: 520px;
  margin-bottom: 16px;
`

const ButtonRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
`

const PrimaryButton = styled.button`
  border: 1px solid rgba(139, 92, 246, 0.6);
  background: rgba(139, 92, 246, 0.2);
  color: rgba(255, 255, 255, 0.9);
  padding: 10px 16px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
`

const SecondaryButton = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.8);
  padding: 10px 16px;
  border-radius: 12px;
  cursor: pointer;
`

const Details = styled.pre`
  margin-top: 16px;
  max-width: 720px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 12px;
  border-radius: 12px;
`

type ErrorBoundaryState = {
  hasError: boolean
  message?: string
  stack?: string
  isChunkError?: boolean
}

export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const stack = `${error.stack ?? ''}\n${info.componentStack ?? ''}`.trim()
    const isChunkError = /ChunkLoadError|Loading chunk/i.test(error.message)
    this.setState({
      hasError: true,
      message: error.message,
      stack,
      isChunkError
    })
    try {
      const debugState = typeof window !== 'undefined' ? (window as any).__NOVADEX_DEBUG__ : null
      const crashContext = debugState?.lastLiquidityContext
      console.error('[novadex-crash]', {
        message: error.message,
        stack,
        context: crashContext ?? null
      })
    } catch {
      // ignore debug logging failures
    }
    reportRuntimeCrash('react.errorboundary', error)
    if (isChunkError) {
      this.tryAutoReload()
    }
  }

  tryAutoReload() {
    try {
      const stamp = sessionStorage.getItem(AUTO_RELOAD_KEY)
      if (stamp === BUILD_STAMP) return
      sessionStorage.setItem(AUTO_RELOAD_KEY, BUILD_STAMP)
      const url = new URL(window.location.href)
      url.searchParams.set('v', BUILD_STAMP)
      window.location.replace(url.toString())
    } catch {
      // ignore auto-reload errors
    }
  }

  handleReload = () => {
    try {
      const url = new URL(window.location.href)
      url.searchParams.set('v', BUILD_STAMP)
      window.location.replace(url.toString())
    } catch {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }
    const debugEnabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'
    const debugState = typeof window !== 'undefined' ? (window as any).__NOVADEX_DEBUG__ : null
    const crashContext = debugState?.lastLiquidityContext ?? null
    const lastAction = debugState?.lastAction ?? null
    const lastPositionState = debugState?.lastPositionState ?? null
    const debugPayload = {
      message: this.state.message,
      stack: this.state.stack,
      context: crashContext,
      lastAction,
      lastPositionState
    }
    return (
      <Wrapper>
        <Title>{this.state.isChunkError ? 'New version deployed' : 'NovaDEX crashed'}</Title>
        <Subtitle>
          {this.state.isChunkError
            ? 'A new version was deployed. Please reload to continue.'
            : 'An unexpected error occurred. The app recovered with a safe fallback screen.'}
        </Subtitle>
        <Subtitle>Build: {BUILD_STAMP}</Subtitle>
        <ButtonRow>
          <PrimaryButton onClick={this.handleReload}>Reload</PrimaryButton>
          {this.state.isChunkError ? (
            <SecondaryButton onClick={() => this.tryAutoReload()}>Retry auto-reload</SecondaryButton>
          ) : null}
          {debugEnabled ? (
            <SecondaryButton
              onClick={() => {
                try {
                  const text = JSON.stringify(debugPayload, null, 2)
                  if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(text)
                  }
                } catch {
                  // ignore clipboard errors
                }
              }}
            >
              Copy debug
            </SecondaryButton>
          ) : null}
        </ButtonRow>
        {debugEnabled && (this.state.message || this.state.stack) ? (
          <Details>
            {this.state.message}
            {this.state.stack ? `\n${this.state.stack}` : ''}
            {crashContext ? `\n\nContext:\n${JSON.stringify(crashContext, null, 2)}` : ''}
            {lastAction ? `\n\nLast action:\n${JSON.stringify(lastAction, null, 2)}` : ''}
            {lastPositionState ? `\n\nLast position:\n${JSON.stringify(lastPositionState, null, 2)}` : ''}
          </Details>
        ) : null}
      </Wrapper>
    )
  }
}
