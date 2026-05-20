import React, { createContext, useContext, useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ThemeMode = 'light' | 'dark' | 'system'

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

const LIGHT: ThemeColors = {
  fondo:       '#F6F1E4',
  texto:       '#0E0E0E',
  acento:      '#E8B53C',
  card:        '#FFFFFF',
  tinta:       '#0E0E0E',
  papel:       '#F6F1E4',
  oro:         '#E8B53C',
  oroHondo:    '#C9961F',
  blanco:      '#FFFFFF',
  grisClaro:   '#E5E0D0',
  rojoUrgente: '#C0392B',
  muted:       '#888888',
}

const DARK: ThemeColors = {
  fondo:       '#1A1A1A',
  texto:       '#F6F1E4',
  acento:      '#E8B53C',
  card:        '#2A2A2A',
  tinta:       '#F6F1E4',
  papel:       '#1A1A1A',
  oro:         '#E8B53C',
  oroHondo:    '#C9961F',
  blanco:      '#FFFFFF',
  grisClaro:   '#333333',
  rojoUrgente: '#C0392B',
  muted:       '#888888',
}

const STORAGE_KEY = '@theme_mode'

interface ThemeContextValue {
  mode:     ThemeMode
  setMode:  (mode: ThemeMode) => void
  colors:   ThemeColors
  isDark:   boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  mode:    'system',
  setMode: () => {},
  colors:  LIGHT,
  isDark:  false,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme          = useColorScheme()
  const [mode, setModeState]  = useState<ThemeMode>('system')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'light' || val === 'dark' || val === 'system') setModeState(val)
    })
  }, [])

  function setMode(m: ThemeMode) {
    setModeState(m)
    void AsyncStorage.setItem(STORAGE_KEY, m)
  }

  const isDark       = mode === 'dark' || (mode === 'system' && systemScheme === 'dark')
  const themeColors  = isDark ? DARK : LIGHT

  return (
    <ThemeContext.Provider value={{ mode, setMode, colors: themeColors, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
