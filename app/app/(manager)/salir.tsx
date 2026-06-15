import { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import { useSignOut } from '@/hooks/useSignOut'

export default function SalirScreen() {
  const { signOut } = useSignOut()
  useEffect(() => { signOut() }, [])
  return <View style={s.root} />
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#15110A' },
})
