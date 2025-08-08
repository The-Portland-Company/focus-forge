import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.loudandclear.app',
  appName: 'Loud & Clear',
  webDir: 'dist',
  ios: {
    preferredContentMode: 'mobile',
    backgroundColor: '#000000',
    scrollEnabled: false,
    allowsLinkPreview: false,
    limitsNavigationsToAppBoundDomains: true,
    contentInset: 'automatic'
  },
  server: {
    iosScheme: 'capacitor',
    cleartext: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 500,
      backgroundColor: '#000000',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#FFFFFF'
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#000000'
    }
  }
};

export default config;