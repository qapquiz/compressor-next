'use client';

import dynamic from 'next/dynamic';
import type { WalletError } from '@solana/wallet-adapter-base';
import {
	ConnectionProvider,
	WalletProvider,
} from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { useCallback } from 'react';
import type { ReactNode } from 'react';

require('@solana/wallet-adapter-react-ui/styles.css');

export const WalletButton = dynamic(
	async () =>
		(await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
	{ ssr: false }
);

export function SolanaProvider({ children }: { children: ReactNode }) {
	const endpoint = "https://mainnet.helius-rpc.com/?api-key=b7d2bd2c-3380-4050-a2bf-4ddf787f74d8";
	const onError = useCallback((error: WalletError) => {
		console.error(error);
	}, []);

	return (
		<ConnectionProvider endpoint={endpoint}>
			<WalletProvider wallets={[]} onError={onError} autoConnect={true}>
				<WalletModalProvider>{children}</WalletModalProvider>
			</WalletProvider>
		</ConnectionProvider>
	);
}
