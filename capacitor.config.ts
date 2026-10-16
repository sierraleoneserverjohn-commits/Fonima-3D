export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  android?: {
    allowMixedContent?: boolean;
  };
}

const config: CapacitorConfig = {
  appId: 'com.fonima.game',
  appName: 'Fonima 3D',
  webDir: 'dist',
  android: {
    allowMixedContent: true
  }
};

export default config;
