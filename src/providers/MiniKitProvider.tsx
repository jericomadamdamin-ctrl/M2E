import { useEffect, PropsWithChildren } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

export const MiniKitProvider = ({ children }: PropsWithChildren) => {
  useEffect(() => {
    let attempts = 0;
    let timeoutId: number | undefined;

    const tryInstall = () => {
      if (MiniKit.isInstalled()) return;

      const appId = import.meta.env.VITE_WORLD_APP_ID || undefined;

      if (typeof window !== 'undefined' && (window as any).WorldApp) {
        MiniKit.install(appId);
        return;
      }

      if (attempts < 10) {
        attempts += 1;
        timeoutId = window.setTimeout(tryInstall, 300);
      }
    };

    tryInstall();

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return <>{children}</>;
};
