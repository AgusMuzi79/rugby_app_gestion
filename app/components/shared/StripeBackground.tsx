import { StyleSheet, useWindowDimensions } from 'react-native'
import Svg, { Defs, Rect, Pattern } from 'react-native-svg'

export function StripeBackground() {
  const { width, height } = useWindowDimensions()
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern
          id="bg-stripes"
          patternUnits="userSpaceOnUse"
          width="34"
          height="34"
          patternTransform="rotate(45 0 0)"
        >
          <Rect y="0" width="34" height="17" fill="#15110A" />
          <Rect y="17" width="34" height="17" fill="#191309" />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#bg-stripes)" />
    </Svg>
  )
}
