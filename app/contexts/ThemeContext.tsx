import React, { createContext, useContext } from 'react'

export interface ThemeColors {
  fondo:       string
  texto:       string
  acento:      string
  card:        string
  tinta:       string
  papel:       string
  oro:         string
  oroHondo:    string
  blanco:      string
  grisClaro:   string
  rojoUrgente: string
  muted:       string
}

const THEME: ThemeColors = {
  fondo:       '#15110A',
  texto:       '#F3EFE4',
  acento:      '#F5B41C',
  card:        '#1C1710',
  tinta:       '#F3EFE4',
  papel:       '#15110A',
  oro:         '#F5B41C',
  oroHondo:    '#C9890A',
  blanco:      '#FFFFFF',
  grisClaro:   '#2C2418',
  rojoUrgente: '#CC4127',
  muted:       '#8E8574',
}

interface ThemeContextValue {
  colors: ThemeColors
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: THEME,
  isDark: true,
})

const THEME_VALUE = { colors: THEME, isDark: true } as const

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={THEME_VALUE}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
