import { Stack } from 'expo-router'

const STACK_OPTS = { headerShown: false } as const

export default function AuthLayout() {
  return <Stack screenOptions={STACK_OPTS} />
}
