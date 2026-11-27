import { useState } from 'react'
import {
  View,
  Text,
  Modal,
  FlatList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, fonts } from '@/constants/theme'

// Full-screen image viewer: black background, swipe between images, pinch
// zoom (iOS: ScrollView zoom; Android shows the image fitted, without zoom).
// Built only with React Native + expo-image so it ships by OTA (no new
// native dependency). Android back closes it (onRequestClose).
// Mount it when opening (and unmount on close) so it starts at indiceInicial.

interface VisorImagenesProps {
  urls:          string[]
  indiceInicial: number
  visible:       boolean
  onClose:       () => void
}

export function VisorImagenes({ urls, indiceInicial, visible, onClose }: VisorImagenesProps) {
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const inicial = Math.min(Math.max(indiceInicial, 0), Math.max(urls.length - 1, 0))
  const [indice, setIndice] = useState(inicial)

  const alTerminarScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndice(Math.round(e.nativeEvent.contentOffset.x / width))
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={v.root}>
        <FlatList
          // The parent mounts the viewer per opening, so initialScrollIndex is
          // the tapped image; remount on rotation so the pages match the width.
          key={String(width)}
          data={urls}
          keyExtractor={(url, i) => `${i}-${url}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // Only read on mount: after a rotation it reopens on the current image.
          initialScrollIndex={indice}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={alTerminarScroll}
          renderItem={({ item, index }) => (
            <ScrollView
              style={{ width, height }}
              contentContainerStyle={{ width, height }}
              maximumZoomScale={3}
              minimumZoomScale={1}
              centerContent
              bouncesZoom
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image
                source={{ uri: item }}
                style={{ width, height }}
                contentFit="contain"
                cachePolicy="memory-disk"
                accessibilityLabel={`Imagen ${index + 1} de ${urls.length}`}
              />
            </ScrollView>
          )}
        />

        <View style={[v.barra, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Text style={v.contador}>
            {urls.length > 1 ? `${indice + 1} / ${urls.length}` : ''}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            activeOpacity={0.7}
            style={v.cerrarBtn}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            hitSlop={8}
          >
            <Text style={v.cerrarTexto}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const v = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  barra: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  contador: {
    fontFamily: fonts.label, fontSize: 14, letterSpacing: 1.5, color: colors.blanco,
    paddingHorizontal: 8,
  },
  cerrarBtn: {
    minWidth: 44, minHeight: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  cerrarTexto: { fontFamily: fonts.label, fontSize: 20, fontWeight: '700', color: colors.blanco },
})
