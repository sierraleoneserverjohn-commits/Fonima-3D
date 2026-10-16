import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fonima.game',
  appName: 'Fonima 3D',
  webDir: 'dist',
  android: {
    allowMixedContent: true
  }
};

export default config;
