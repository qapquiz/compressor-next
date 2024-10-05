"use client";

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { env } from "@/env/client";
import { getCompressedTokens, getTokens } from "@/app/lib/solana";
import { createRpc } from "@lightprotocol/stateless.js";
import type { Rpc } from "@lightprotocol/stateless.js";
import type { ReactNode } from "react";
import { WalletButton } from "./solana/solana-provider";
import { TokenList } from "./TokenList";

enum DialogState {
	Idle = "Idle",
	ConfirmingTransaction = "ConfirmingTransaction",
	Processing = "Processing",
	Success = "Success",
	Error = "Error",
}

const compressionRpc: Rpc = createRpc(env.NEXT_PUBLIC_HELIUS_RPC_URL, env.NEXT_PUBLIC_HELIUS_RPC_URL);

export default function PortfolioPage() {
	const { connected, publicKey, signTransaction } = useWallet();
	const { connection } = useConnection();
	const [alertDialogOpen, setAlertDialogOpen] = useState(false);
	const [alertDialogContent, setAlertDialogConent] = useState<{ title: string, message: string | ReactNode }>({ title: "", message: "" });
	const [dialogState, setDialogState] = useState<DialogState>(DialogState.Idle);

	const {
		data: tokenAccounts,
		isLoading: isLoadingTokenAccounts,
		error: fetchTokenAccountsError,
		refetch: refetchTokenAccounts,
	} = useQuery({
		queryKey: ["tokenAccounts", publicKey],
		queryFn: async () => {
			if (!(connected && publicKey)) {
				return [];
			}

			const tokenAccounts = await getTokens(connection.rpcEndpoint, publicKey);
			return tokenAccounts;
		},
	});

	const {
		data: compressedTokenAccounts,
		isLoading: isLoadingCompressedTokenAccounts,
		error: fetchCompressedTokenAccountsError,
		refetch: refetchCompressedTokenAccounts,
	} = useQuery({
		queryKey: ["compressedTokenAccounts", publicKey],
		queryFn: async () => {
			if (!(connected && publicKey)) {
				return [];
			}

			const tokenAccounts = await getCompressedTokens(compressionRpc, publicKey);
			return tokenAccounts;
		},
		initialData: [],
	});

	const isLoading = useMemo(
		() => (isLoadingTokenAccounts || isLoadingCompressedTokenAccounts),
		[isLoadingTokenAccounts, isLoadingCompressedTokenAccounts]
	);

	const userTokenAccounts = useMemo(
		() => tokenAccounts?.concat(compressedTokenAccounts).sort((a, b) => {
			const amountA = Number(a.amount) / 10 ** a.decimals;
			const amountB = Number(b.amount) / 10 ** b.decimals;

			return amountB - amountA;
		}),
		[tokenAccounts, compressedTokenAccounts]
	);

	useEffect(() => {
		if (!fetchTokenAccountsError && !fetchCompressedTokenAccountsError) {
			return;
		}

		// @todo handle errors when fetching token accounts failed
	}, [
		fetchTokenAccountsError,
		fetchCompressedTokenAccountsError
	]);

	const compress = async () => {
		try {
			console.log("compress");
		} catch (error) {
			console.error(error);
			setDialogState(DialogState.Error);
			setAlertDialogConent({
				title: 'Compress cancelled',
				message: `${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}
	};
	const decompress = async () => {
		try {
			console.log("decompress");
		} catch (error) {
			console.error(error);
			setDialogState(DialogState.Error);
			setAlertDialogConent({
				title: 'Decompress cancelled',
				message: `${error instanceof Error ? error.message : 'Unknown error'}`
			});
		}

	};

	return (
		<div className="flex flex-col gap-4">
			{/* page content */}
			<nav className="flex flex-row items-top justify-between">
				<h1 className="text-xl font-bold font-mono">COMPRESSOR</h1>
				<WalletButton />
			</nav>
			<div>
				{
					isLoading ?
						<div>Loading... {isLoading}</div> :
						userTokenAccounts && userTokenAccounts.length > 0 ?
							<div className="border rounded-lg w-[480px] h-[480px]">
								<TokenList tokenAccounts={userTokenAccounts} isLoading={isLoading} />
							</div> :
							<p>
								No tokens found.
							</p>
				}
			</div>

			{/*alert section it will depends on the dialog state */}
			<AlertDialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{alertDialogContent.title}</AlertDialogTitle>
						<AlertDialogDescription>
							{alertDialogContent.message}
						</AlertDialogDescription>
					</AlertDialogHeader>
					{(dialogState === DialogState.Success || dialogState === DialogState.Error) && (
						<AlertDialogFooter>
							<AlertDialogCancel onClick={() => {
								setAlertDialogOpen(false);
								setDialogState(DialogState.Idle);
							}}>
								Close
							</AlertDialogCancel>
						</AlertDialogFooter>
					)}
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

