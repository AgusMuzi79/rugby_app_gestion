import React, { createContext, useContext } from 'react'
import { colors } from '../constants/theme'

// La paleta sale de constants/theme.ts (fuente única, T17). Se mantienen las
// claves históricas de useTheme() (fondo, texto, acento, card, tinta, papel,
// oro, oroHondo, blanco, grisClaro, rojoUrgente, muted) y se suman los
// semánticos nuevos. `acento` es el oro de marca.
export type ThemeColors = typeof colors & { acento: string }

export const THEME_COLORS: ThemeColors = {
  ...colors,
  acento: colors.oro,
}

interface ThemeContextValue {
  colors: ThemeColors
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: THEME_COLORS,
  isDark: true,
})

const THEME_VALUE = { colors: THEME_COLORS, isDark: true } as const

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
