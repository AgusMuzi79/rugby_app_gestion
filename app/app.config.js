/** @type {import('expo/config').ExpoConfig} */
const IS_DEV = process.env.APP_VARIANT === 'development'

const config = {
  name: IS_DEV ? 'Uncas (Dev)' : 'Uncas Rugby App',
  slug: 'uncas-rugby-app',
  scheme: 'uncasrugby',
  version: '1.0.2',
  orientation: 'portrait',
  icon: './assets/images/logo.png',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  splash: {
    image: './assets/images/logo.png',
    resizeMode: 'contain',
    backgroundColor: '#15110A',
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: IS_DEV ? 'com.uncas.rugbyapp.dev' : 'com.uncas.rugbyapp',
    // Apple rechaza el ícono si tiene canal alfa — a diferencia de `icon`/Android,
    // no puede reusar logo.png (tiene transparencia). Ver assets/images/icon-store-512.png.
    icon: './assets/images/icon-ios-1024.png',
    infoPlist: {
      // La app solo usa HTTPS estándar (Supabase/Expo), sin cifrado propio —
      // declarar esto evita que Apple pida la respuesta manual en cada revisión.
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    icon: './assets/images/logo.png',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#15110A',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: IS_DEV ? 'com.uncas.rugbyapp.dev' : 'com.uncas.rugbyapp',
    usesCleartextTraffic: true,
    // En EAS Build, GOOGLE_SERVICES_JSON es el path al archivo subido como file env var.
    // En local, cae al archivo del repo (excluido de git, presente en la máquina de dev).
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-asset',
    'expo-font',
    'expo-secure-store',
    // Orden importante: los mods de Info.plist de Expo se aplican en orden
    // INVERSO al de este array (el último plugin listado corre primero). Con
    // expo-camera después de expo-image-picker, el cameraPermission:false de
    // este último terminaba corriendo al final y borrando el texto real de
    // la cámara (build iOS #2 salió sin NSCameraUsageDescription, rechazado
    // por Apple). expo-camera va primero para que sea el último en aplicarse.
    [
      'expo-camera',
      {
        cameraPermission: 'Uncas usa la cámara para escanear el carnet QR de los socios en portería.',
        microphonePermission: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Uncas usa tu galería para que subas tu foto de perfil y el comprobante de pago de tu cuota.',
        // NO poner cameraPermission: false acá. A diferencia de iOS (donde
        // false solo omite el string de Info.plist), en Android el plugin de
        // expo-image-picker interpreta cameraPermission: false como "bloqueame
        // este permiso para toda la app" (withBlockedPermissions, agrega
        // tools:node="remove" al manifest) — le borraba a expo-camera el
        // <uses-permission CAMERA/> que sí necesitamos para el scanner de
        // Lector, en TODOS los builds de Android hasta ahora (2026-09-03).
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/images/logo.png',
        color: '#F5B41C',
      },
    ],
    'expo-audio',
    [
      'expo-local-authentication',
      {
        faceIDPermission: 'Uncas usa Face ID para que ingreses más rápido la próxima vez.',
      },
    ],
  ],
  extra: {
    router: {},
    eas: {
      projectId: 'd363d962-7caf-4050-81fc-b70b493289ca',
    },
  },
}

module.exports = { expo: config }
