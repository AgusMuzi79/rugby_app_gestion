/** @type {import('expo/config').ExpoConfig} */
const config = {
  name: 'Uncas Rugby App',
  slug: 'uncas-rugby-app',
  scheme: 'uncasrugby',
  version: '1.0.0',
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
  },
  android: {
    icon: './assets/images/logo.png',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#15110A',
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: 'com.uncas.rugbyapp',
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
    'expo-image-picker',
    'expo-camera',
  ],
  extra: {
    router: {},
    eas: {
      projectId: 'd363d962-7caf-4050-81fc-b70b493289ca',
    },
  },
}

module.exports = { expo: config }
