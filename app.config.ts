import type { ExpoConfig } from "@expo/config";

const updatesEnabled = process.env.EXPO_PUBLIC_ENABLE_UPDATES === "true";
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const baseUrl =
  process.env.EXPO_PUBLIC_BASE_URL ||
  (process.env.GITHUB_ACTIONS === "true" && repoName ? `/${repoName}` : "/barra");

const config: ExpoConfig = {
  name: "Barra Scanner Mobile",
  slug: "barra-scanner-mobile",
  version: "1.0.0",
  jsEngine: "jsc",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  userInterfaceStyle: "automatic",
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.jdioses.barrascannermobile",
  },
  android: {
    package: "com.jdioses.barrascannermobile",
    permissions: ["NFC"],
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/images/favicon.png",
    bundler: "metro",
    output: "single",
    name: "Barra Scanner",
    shortName: "Barra",
    description: "Secure scanner workspace with offline-ready web support.",
    themeColor: "#111E33",
    backgroundColor: "#050B14",
  },
  experiments: {
    baseUrl,
  },
  plugins: ["expo-sharing", "expo-font", "@react-native-community/datetimepicker"],
  updates: {
    enabled: updatesEnabled,
    checkAutomatically: "ON_ERROR_RECOVERY",
    fallbackToCacheTimeout: 0,
  },
  extra: {
    firebaseConfigured: Boolean(
      process.env.EXPO_PUBLIC_FIREBASE_API_KEY &&
      process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN &&
      process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.EXPO_PUBLIC_FIREBASE_APP_ID
    ),
    updatesEnabled,
    eas: {
      projectId: "9df1d304-2e6c-4f53-8de2-0a68f66ac050",
    },
  },
};

if (updatesEnabled) {
  config.runtimeVersion = {
    policy: "appVersion",
  };
}

export default config;
