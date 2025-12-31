import { transparentize } from 'polished'
import React, { useMemo } from 'react'
import styled, {
  ThemeProvider as StyledComponentsThemeProvider,
  createGlobalStyle,
  css,
  DefaultTheme
} from 'styled-components'
import { Text, TextProps } from 'rebass'
import { Colors } from './styled'

export * from './components'

const MEDIA_WIDTHS = {
  upToExtraSmall: 500,
  upToSmall: 600,
  upToMedium: 960,
  upToLarge: 1280
}

const mediaWidthTemplates: { [width in keyof typeof MEDIA_WIDTHS]: typeof css } = Object.keys(MEDIA_WIDTHS).reduce(
  (accumulator, size) => {
    ;(accumulator as any)[size] = (a: any, b: any, c: any) => css`
      @media (max-width: ${(MEDIA_WIDTHS as any)[size]}px) {
        ${css(a, b, c)}
      }
    `
    return accumulator
  },
  {}
) as any

const white = '#FFFFFF'
const black = '#000000'

export function colors(darkMode: boolean): Colors {
  return {
    // base
    white,
    black,

    // text
    text1: darkMode ? '#EDE9FF' : '#0B0F1A',
    text2: darkMode ? '#B8B2D6' : '#2E3342',
    text3: darkMode ? '#9C95C7' : '#5B6375',
    text4: darkMode ? '#7F7AA6' : '#8A93A8',
    text5: darkMode ? '#3A3550' : '#E8EAF4',

    // backgrounds / greys
    bg1: darkMode ? '#0B0F1A' : '#0F1424',
    bg2: darkMode ? '#141A2E' : '#171C30',
    bg3: darkMode ? '#1E2742' : '#222944',
    bg4: darkMode ? '#2A3557' : '#2F385B',
    bg5: darkMode ? '#39456D' : '#3F4871',

    //specialty colors
    modalBG: darkMode ? 'rgba(6,9,20,0.45)' : 'rgba(6,8,18,0.45)',
    advancedBG: darkMode ? 'rgba(16,22,40,0.65)' : 'rgba(19,24,44,0.6)',

    //primary colors
    primary1: darkMode ? '#8B5CF6' : '#8B5CF6',
    primary2: darkMode ? '#FF4FD8' : '#FF4FD8',
    primary3: darkMode ? '#4DA3FF' : '#4DA3FF',
    primary4: darkMode ? 'rgba(139,92,246,0.35)' : 'rgba(139,92,246,0.35)',
    primary5: darkMode ? 'rgba(139,92,246,0.22)' : 'rgba(139,92,246,0.22)',

    // color text
    primaryText1: darkMode ? '#EDE9FF' : '#EDE9FF',

    // secondary colors
    secondary1: darkMode ? '#FF4FD8' : '#FF4FD8',
    secondary2: darkMode ? '#2B1C3B' : '#2B1C3B',
    secondary3: darkMode ? '#25182F' : '#25182F',

    // other
    red1: '#FF6871',
    red2: '#F82D3A',
    green1: '#27AE60',
    yellow1: '#FFE270',
    yellow2: '#F3841E'

    // dont wanna forget these blue yet
    // blue4: darkMode ? '#153d6f70' : '#C4D9F8',
    // blue5: darkMode ? '#153d6f70' : '#EBF4FF',
  }
}

export function theme(darkMode: boolean): DefaultTheme {
  return {
    ...colors(darkMode),

    grids: {
      sm: 8,
      md: 12,
      lg: 24
    },

    //shadows
    shadow1: darkMode ? '#000' : '#2F80ED',

    // media queries
    mediaWidth: mediaWidthTemplates,

    // css snippets
    flexColumnNoWrap: css`
      display: flex;
      flex-flow: column nowrap;
    `,
    flexRowNoWrap: css`
      display: flex;
      flex-flow: row nowrap;
    `
  }
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeObject = useMemo(() => theme(true), [])

  return <StyledComponentsThemeProvider theme={themeObject}>{children}</StyledComponentsThemeProvider>
}

const TextWrapper = styled(Text)<{ color: keyof Colors }>`
  color: ${({ color, theme }) => (theme as any)[color]};
`

export const TYPE = {
  main(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'text2'} {...props} />
  },
  link(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'primary1'} {...props} />
  },
  black(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'text1'} {...props} />
  },
  body(props: TextProps) {
    return <TextWrapper fontWeight={400} fontSize={16} color={'text1'} {...props} />
  },
  largeHeader(props: TextProps) {
    return <TextWrapper fontWeight={600} fontSize={24} {...props} />
  },
  mediumHeader(props: TextProps) {
    return <TextWrapper fontWeight={500} fontSize={20} {...props} />
  },
  subHeader(props: TextProps) {
    return <TextWrapper fontWeight={400} fontSize={14} {...props} />
  },
  blue(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'primary1'} {...props} />
  },
  yellow(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'yellow1'} {...props} />
  },
  darkGray(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'text3'} {...props} />
  },
  gray(props: TextProps) {
    return <TextWrapper fontWeight={500} color={'bg3'} {...props} />
  },
  italic(props: TextProps) {
    return <TextWrapper fontWeight={500} fontSize={12} fontStyle={'italic'} color={'text2'} {...props} />
  },
  error({ error, ...props }: { error: boolean } & TextProps) {
    return <TextWrapper fontWeight={500} color={error ? 'red1' : 'text2'} {...props} />
  }
}

export const FixedGlobalStyle = createGlobalStyle`
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

:root {
  --nova-bg: #0b0f1a;
  --nova-surface: #12182a;
  --nova-accent: #8b5cf6;
  --nova-accent-2: #ff4fd8;
  --nova-accent-3: #4da3ff;
}

html, input, textarea, button {
  font-family: 'Space Grotesk', sans-serif;
  letter-spacing: -0.012em;
  font-display: fallback;
}

html,
body {
  margin: 0;
  padding: 0;
}

* {
  box-sizing: border-box;
}

button {
  user-select: none;
}

html {
  font-size: 16px;
  font-variant: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
}
`

export const ThemedGlobalStyle = createGlobalStyle`
html {
  color: ${({ theme }) => theme.text1};
  background-color: ${({ theme }) => theme.bg1};
}

body {
  min-height: 100vh;
  background-repeat: no-repeat;
  background-attachment: fixed;
  background-image: ${({ theme }) => `
    radial-gradient(1200px 800px at 10% -10%, ${transparentize(0.72, theme.primary1)} 0%, transparent 60%),
    radial-gradient(900px 700px at 95% 5%, ${transparentize(0.75, theme.primary2)} 0%, transparent 60%),
    radial-gradient(800px 700px at 50% 120%, ${transparentize(0.78, theme.primary3)} 0%, transparent 60%),
    linear-gradient(180deg, ${transparentize(0.0, theme.bg1)} 0%, ${transparentize(0.0, theme.bg2)} 100%)
  `};
}
`
