import { useEffect } from 'react'
import { View } from 'react-native'
import { useSignOut } from '@/hooks/useSignOut'

export default function SalirScreen() {
  const { signOut } = useSignOut()
  useEffect(() => { signOut() }, [])
  return <View style={{ flex: 1, backgroundColor: '#1A1A1A' }} />
}
