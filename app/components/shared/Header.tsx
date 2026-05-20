import { View, Text, Image, StyleSheet } from 'react-native'
import { fonts } from '@/constants/theme'
import { useTheme } from '@/contexts/ThemeContext'

export function Header() {
  const { colors: tc } = useTheme()
  return (
    <View style={[styles.container, { backgroundColor: tc.fondo }]}>
      <View style={styles.row}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.textBlock}>
          <Text style={[styles.clubName, { color: tc.texto }]}>UNCAS RUGBY CLUB</Text>
          <Text style={[styles.titulo, { color: tc.texto }]}>Uncas Rugby App</Text>
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: tc.grisClaro }]} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  logo: {
    width: 44,
    height: 44,
  },
  textBlock: {
    flex: 1,
  },
  clubName: {
    fontFamily: fonts.label,
    fontSize: 9,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  titulo: {
    fontFamily: fonts.titulo,
    fontSize: 22,
    lineHeight: 26,
  },
  divider: {
    height: 1,
  },
})
