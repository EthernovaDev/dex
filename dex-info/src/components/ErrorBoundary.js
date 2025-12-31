import React from 'react'
import styled from 'styled-components'
import { SUBGRAPH_URL } from '../constants/urls'

const BUILD_STAMP = process.env.REACT_APP_BUILD_STAMP || 'unknown'

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
  font-size: 26px;
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

const Button = styled.button`
  border: 1px solid rgba(139, 92, 246, 0.6);
  background: rgba(139, 92, 246, 0.2);
  color: rgba(255, 255, 255, 0.9);
  padding: 10px 16px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
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

export default class ErrorBoundary extends React.Component {
  state = { hasError: false, message: '', stack: '' }

  componentDidCatch(error, info) {
    const stack = `${error?.stack || ''}\n${info?.componentStack || ''}`.trim()
    this.setState({ hasError: true, message: error?.message || 'Unknown error', stack })
    try {
      const hash = window.location?.hash || ''
      const tokenMatch = hash.match(/\/token\/(0x[a-fA-F0-9]{40})/)
      const payload = {
        message: error?.message || 'Unknown error',
        stack,
        url: window.location?.href,
        route: hash || window.location?.pathname,
        tokenAddress: tokenMatch?.[1]?.toLowerCase() || null,
        subgraph: SUBGRAPH_URL,
        lastQuery: window.__NOVADEX_INFO_LAST_QUERY__ || null,
        build: BUILD_STAMP,
      }
      window.__NOVADEX_INFO_CRASH__ = payload
      console.error('[novadex-info-crash]', payload)
    } catch {
      // ignore
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
    if (!this.state.hasError) return this.props.children
    const debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1'
    const hash = window.location?.hash || ''
    const tokenMatch = hash.match(/\/token\/(0x[a-fA-F0-9]{40})/)
    const payload = {
      message: this.state.message,
      stack: this.state.stack,
      url: window.location?.href,
      route: hash || window.location?.pathname,
      tokenAddress: tokenMatch?.[1]?.toLowerCase() || null,
      subgraph: SUBGRAPH_URL,
      lastQuery: window.__NOVADEX_INFO_LAST_QUERY__ || null,
      build: BUILD_STAMP,
    }
    return (
      <Wrapper>
        <Title>NovaDEX Analytics crashed</Title>
        <Subtitle>An unexpected error occurred. The app recovered with a safe fallback screen.</Subtitle>
        <Subtitle>Build: {BUILD_STAMP}</Subtitle>
        <ButtonRow>
          <Button onClick={this.handleReload}>Reload</Button>
          {debugEnabled ? (
            <Button
              onClick={() => {
                try {
                  const text = JSON.stringify(payload, null, 2)
                  if (navigator?.clipboard?.writeText) {
                    navigator.clipboard.writeText(text)
                  }
                } catch {
                  // ignore
                }
              }}
            >
              Copy debug
            </Button>
          ) : null}
        </ButtonRow>
        {debugEnabled ? <Details>{JSON.stringify(payload, null, 2)}</Details> : null}
      </Wrapper>
    )
  }
}
