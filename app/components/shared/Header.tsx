import { View, Text, Image, StyleSheet } from 'react-native'
import { colors, fonts } from '@/constants/theme'

export function Header() {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.textBlock}>
          <Text style={styles.clubName}>UNCAS RUGBY CLUB</Text>
          <Text style={styles.titulo}>La Bitácora</Text>
        </View>
      </View>
      <View style={styles.divider} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.papel,
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
    color: colors.tinta,
    marginBottom: 2,
  },
  titulo: {
    fontFamily: fonts.titulo,
    fontSize: 22,
    color: colors.tinta,
    lineHeight: 26,
  },
  divider: {
    height: 1,
    backgroundColor: colors.grisClaro,
  },
})
