import React from 'react'
import { ThemeProvider as StyledComponentsThemeProvider, createGlobalStyle } from 'styled-components'
import { useDarkModeManager } from '../contexts/LocalStorage'
import styled from 'styled-components'
import { Text } from 'rebass'

export default function ThemeProvider({ children }) {
  const [darkMode] = useDarkModeManager()

  return <StyledComponentsThemeProvider theme={theme(darkMode)}>{children}</StyledComponentsThemeProvider>
}

const theme = (darkMode, color) => ({
  customColor: color,
  textColor: darkMode ? color : 'black',

  panelColor: darkMode ? 'rgba(255, 255, 255, 0)' : 'rgba(255, 255, 255, 0)',
  backgroundColor: darkMode ? '#0B0F1A' : '#0F1424',

  uniswapPink: darkMode ? '#FF4FD8' : '#FF4FD8',

  concreteGray: darkMode ? '#141A2B' : '#141A2B',
  inputBackground: darkMode ? '#111827' : '#111827',
  shadowColor: darkMode ? '#000' : '#2F80ED',
  mercuryGray: darkMode ? '#2B3350' : '#2B3350',

  text1: darkMode ? '#F8F9FF' : '#F8F9FF',
  text2: darkMode ? '#B7BED0' : '#B7BED0',
  text3: darkMode ? '#7E879F' : '#7E879F',
  text4: darkMode ? '#59617A' : '#59617A',
  text5: darkMode ? '#2A3144' : '#2A3144',

  // special case text types
  white: '#FFFFFF',

  // backgrounds / greys
  bg1: darkMode ? '#0B0F1A' : '#0F1424',
  bg2: darkMode ? '#12182A' : '#171C30',
  bg3: darkMode ? '#1E243B' : '#222944',
  bg4: darkMode ? '#2B3350' : '#2F385B',
  bg5: darkMode ? '#3A4366' : '#3F4871',
  bg6: darkMode ? '#0B0F1A' : '#0F1424',

  //specialty colors
  modalBG: darkMode ? 'rgba(5,7,16,0.8)' : 'rgba(5,7,16,0.8)',
  advancedBG: darkMode ? 'rgba(12,16,32,0.6)' : 'rgba(12,16,32,0.6)',
  onlyLight: darkMode ? '#141A2B' : '#141A2B',
  divider: darkMode ? 'rgba(43, 43, 43, 0.435)' : 'rgba(43, 43, 43, 0.035)',

  //primary colors
  primary1: darkMode ? '#8B5CF6' : '#8B5CF6',
  primary2: darkMode ? '#FF4FD8' : '#FF4FD8',
  primary3: darkMode ? '#4DA3FF' : '#4DA3FF',
  primary4: darkMode ? '#5B3AAE60' : '#5B3AAE60',
  primary5: darkMode ? '#2A1E4B60' : '#2A1E4B60',

  // color text
  primaryText1: darkMode ? '#C7B3FF' : '#C7B3FF',

  // secondary colors
  secondary1: darkMode ? '#FF4FD8' : '#FF4FD8',
  secondary2: darkMode ? '#2B1C3B' : '#2B1C3B',
  secondary3: darkMode ? '#25182F' : '#25182F',

  shadow1: darkMode ? '#000' : '#2F80ED',

  // other
  red1: '#FF6871',
  green1: '#27AE60',
  yellow1: '#FFE270',
  yellow2: '#F3841E',
  link: '#8B5CF6',
  blue: '#4DA3FF',

  background: darkMode
    ? 'linear-gradient(180deg, #0b0f1a 0%, #12182a 100%)'
    : 'linear-gradient(180deg, #0b0f1a 0%, #12182a 100%)',
})

const TextWrapper = styled(Text)`
  color: ${({ color, theme }) => theme[color]};
`

export const TYPE = {
  main(props) {
    return <TextWrapper fontWeight={500} fontSize={14} color={'text1'} {...props} />
  },

  body(props) {
    return <TextWrapper fontWeight={400} fontSize={14} color={'text1'} {...props} />
  },

  small(props) {
    return <TextWrapper fontWeight={500} fontSize={11} color={'text1'} {...props} />
  },

  header(props) {
    return <TextWrapper fontWeight={600} color={'text1'} {...props} />
  },

  largeHeader(props) {
    return <TextWrapper fontWeight={500} color={'text1'} fontSize={24} {...props} />
  },

  light(props) {
    return <TextWrapper fontWeight={400} color={'text3'} fontSize={14} {...props} />
  },

  pink(props) {
    return <TextWrapper fontWeight={props.faded ? 400 : 600} color={props.faded ? 'text1' : 'text1'} {...props} />
  },
}

export const Hover = styled.div`
  :hover {
    cursor: pointer;
  }
`

export const Link = styled.a.attrs({
  target: '_blank',
  rel: 'noopener noreferrer',
})`
  text-decoration: none;
  cursor: pointer;
  color: ${({ theme }) => theme.primary1};
  font-weight: 500;
  :hover {
    text-decoration: underline;
  }
  :focus {
    outline: none;
    text-decoration: underline;
  }
  :active {
    text-decoration: none;
  }
`

export const ThemedBackground = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  max-width: 100vw !important;
  height: 200vh;
  mix-blend-mode: color;
  background: ${({ backgroundColor }) =>
    `radial-gradient(50% 50% at 50% 50%, ${backgroundColor} 0%, rgba(255, 255, 255, 0) 100%)`};
  position: absolute;
  top: 0px;
  left: 0px;
  /* z-index: ; */

  transform: translateY(-110vh);
`

export const GlobalStyle = createGlobalStyle`
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');
  html { font-family: 'Space Grotesk', sans-serif; }
  
  html,
  body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    font-size: 14px;    
    background-color: ${({ theme }) => theme.bg6};
    background-attachment: fixed;
    background-image: ${({ theme }) => `
      radial-gradient(1200px 800px at 10% -10%, rgba(139, 92, 246, 0.25) 0%, transparent 60%),
      radial-gradient(900px 700px at 95% 5%, rgba(255, 79, 216, 0.2) 0%, transparent 60%),
      radial-gradient(800px 700px at 50% 120%, rgba(77, 163, 255, 0.18) 0%, transparent 60%),
      linear-gradient(180deg, ${theme.bg1} 0%, ${theme.bg2} 100%)
    `};
  }

  a {
    text-decoration: none;

    :hover {
      text-decoration: none
    }
  }

  
.three-line-legend {
	width: 100%;
	height: 70px;
	position: absolute;
	padding: 8px;
	font-size: 12px;
	color: #20262E;
	background-color: rgba(255, 255, 255, 0.23);
	text-align: left;
	z-index: 10;
  pointer-events: none;
}

.three-line-legend-dark {
	width: 100%;
	height: 70px;
	position: absolute;
	padding: 8px;
	font-size: 12px;
	color: white;
	background-color: rgba(255, 255, 255, 0.23);
	text-align: left;
	z-index: 10;
  pointer-events: none;
}

@media screen and (max-width: 800px) {
  .three-line-legend {
    display: none !important;
  }
}

.tv-lightweight-charts{
  width: 100% !important;
  

  & > * {
    width: 100% !important;
  }
}


  html {
    font-size: 1rem;
    font-variant: none;
    color: 'black';
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
    height: 100%;
  }
`
