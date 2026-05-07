import { View, Text, StyleSheet } from 'react-native'

export default function UsuariosScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>SUBCOMISIÓN</Text>
      <Text style={styles.title}>Usuarios</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F0E8' },
  label: { fontSize: 10, letterSpacing: 2.5, textTransform: 'uppercase', color: '#C9A84C', marginBottom: 8 },
  title: { fontSize: 32, fontStyle: 'italic', fontFamily: 'serif', color: '#1A1A1A' },
})
