import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fit.swordandshield.app',
  appName: 'Sword and Shield',
  webDir: 'out',
  server: {
    url: 'http://localhost:3000',
    cleartext: true,
  },
};

export default config;