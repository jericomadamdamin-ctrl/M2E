import { useEffect, PropsWithChildren } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

export const MiniKitProvider = ({ children }: PropsWithChildren) => {
  useEffect(() => {
    MiniKit.install();
  }, []);

  return <>{children}</>;
};
