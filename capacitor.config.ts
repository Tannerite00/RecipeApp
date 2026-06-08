import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.plantiful.app',
  appName: 'Plantiful',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
