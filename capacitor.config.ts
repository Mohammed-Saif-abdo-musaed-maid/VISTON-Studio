import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.viston.studio",
  appName: "VISTON Studio",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;