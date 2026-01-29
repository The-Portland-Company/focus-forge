import { CapacitorConfig } from '@capacitor/cli';

const serverTargets = {
  local: process.env.CAPACITOR_LOCAL_URL || 'http://localhost:3244',
  staging: 'https://loud-and-clear-inbox-and-task-manager-production.up.railway.app',
  production: 'https://commandcenter.theportlandcompany.com'
};

const serverTarget = process.env.CAPACITOR_SERVER as keyof typeof serverTargets | undefined;
const resolvedServerUrl =
  process.env.CAPACITOR_SERVER_URL ||
  (serverTarget && serverTargets[serverTarget] ? serverTargets[serverTarget] : undefined);

const serverConfig: CapacitorConfig['server'] = resolvedServerUrl
  ? {
      url: resolvedServerUrl,
      cleartext: resolvedServerUrl.startsWith('http://')
    }
  : {
      iosScheme: 'capacitor',
      cleartext: false
    };

const config: CapacitorConfig = {
  appId: 'com.commandcenter.app',
  appName: 'Command Center',
  webDir: 'dist',
  ios: {
    preferredContentMode: 'mobile',
    backgroundColor: '#000000',
    scrollEnabled: false,
    allowsLinkPreview: false,
    limitsNavigationsToAppBoundDomains: false,
    contentInset: 'automatic'
  },
  server: serverConfig,
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
