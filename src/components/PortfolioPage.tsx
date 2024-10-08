"use client";

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { env } from "@/env/client";
import {
	findAssociatedTokenAddress,
	getCompressedTokens,
	getTokens,
	isAccountInitialized,
	isCompressedTokenAlreadyInitialized,
} from "@/app/lib/solana";
import {
	bn,
	buildTx,
	createRpc,
	defaultTestStateTreeAccounts,
	sendAndConfirmTx,
} from "@lightprotocol/stateless.js";
import type { Rpc } from "@lightprotocol/stateless.js";
import type { ReactNode } from "react";
import { WalletButton } from "./solana/solana-provider";
import { TokenList } from "./TokenList";
import { WalletNotConnectedError } from "@solana/wallet-adapter-base";
import { ComputeBudgetProgram } from "@solana/web3.js";
import type { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
	CompressedTokenProgram,
	selectMinCompressedTokenAccountsForTransfer,
} from "@lightprotocol/compressed-token";
import {
	createAssociatedTokenAccountInstruction,
	createCloseAccountInstruction,
	getAssociatedTokenAddress,
} from "@solana/spl-token";
import { Loader2 } from "lucide-react";
import { CompressedSwapCard } from "./CompressedSwapCard";

export enum DialogState {
	Idle = "Idle",
	ConfirmingTransaction = "ConfirmingTransaction",
	Processing = "Processing",
	Success = "Success",
	Error = "Error",
}

const compressionRpc: Rpc = createRpc(
	env.NEXT_PUBLIC_HELIUS_RPC_URL,
	env.NEXT_PUBLIC_HELIUS_RPC_URL,
);

export default function PortfolioPage() {
	const { connected, publicKey, signTransaction } = useWallet();
	const { connection } = useConnection();
	const [alertDialogOpen, setAlertDialogOpen] = useState(false);
	const [alertDialogContent, setAlertDialogContent] = useState<{
		title: string;
		message: string | ReactNode;
	}>({ title: "", message: "" });
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

			const tokenAccounts = await getCompressedTokens(
				compressionRpc,
				publicKey,
			);
			return tokenAccounts;
		},
		initialData: [],
	});

	const rpc = useMemo(() => {
		return createRpc(connection.rpcEndpoint, connection.rpcEndpoint);
	}, [connection.rpcEndpoint]);

	const isLoading = useMemo(
		() => isLoadingTokenAccounts || isLoadingCompressedTokenAccounts,
		[isLoadingTokenAccounts, isLoadingCompressedTokenAccounts],
	);

	const userTokenAccounts = useMemo(
		() =>
			tokenAccounts?.concat(compressedTokenAccounts).sort((a, b) => {
				const amountA = (Number(a.amount) / 10 ** a.decimals) * a.pricePerToken;
				const amountB = (Number(b.amount) / 10 ** b.decimals) * b.pricePerToken;

				return amountB - amountA;
			}),
		[tokenAccounts, compressedTokenAccounts],
	);

	useEffect(() => {
		if (!fetchTokenAccountsError && !fetchCompressedTokenAccountsError) {
			return;
		}

		// @todo handle errors when fetching token accounts failed
	}, [fetchTokenAccountsError, fetchCompressedTokenAccountsError]);

	const compress = async (mint: PublicKey, amount: BN) => {
		try {
			if (!connected || !publicKey || !signTransaction)
				throw new WalletNotConnectedError();

			setAlertDialogOpen(true);
			setDialogState(DialogState.ConfirmingTransaction);
			setAlertDialogContent({
				title: "Confirming Transaction",
				message: "Please confirm the transaction in your wallet...",
			});

			const ixs = [
				ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
			];

			if (!(await isCompressedTokenAlreadyInitialized({ connection, mint }))) {
				const createTokenPoolIx = await CompressedTokenProgram.createTokenPool({
					feePayer: publicKey,
					mint: mint,
				});

				ixs.push(createTokenPoolIx);
			}

			const sourceAta = findAssociatedTokenAddress(publicKey, mint);
			const compressIx = await CompressedTokenProgram.compress({
				payer: publicKey,
				owner: publicKey,
				source: sourceAta,
				toAddress: publicKey,
				mint: mint,
				amount: amount,
				outputStateTree: defaultTestStateTreeAccounts().merkleTree,
			});

			ixs.push(compressIx);

			const closeTokenAccountIx = createCloseAccountInstruction(
				sourceAta,
				publicKey,
				publicKey,
			);
			ixs.push(closeTokenAccountIx);

			const { value: blockhashCtx } =
				await connection.getLatestBlockhashAndContext();
			const tx = buildTx(ixs, publicKey, blockhashCtx.blockhash);

			const signedTx = await signTransaction(tx);

			setDialogState(DialogState.Processing);
			setAlertDialogContent({
				title: "Confirming Transaction",
				message: "Please wait while the transaction is being confirmed...",
			});

			const txId = await sendAndConfirmTx(rpc, signedTx);

			// refecth tokens
			await refetchTokenAccounts();
			await refetchCompressedTokenAccounts();

			setDialogState(DialogState.Success);
			setAlertDialogContent({
				title: "Token compress successfully",
				message: (
					<a href={`https://photon.helius.dev/tx/${txId}?cluster=mainnet-beta`}>
						Transaction ID: ${txId}
					</a>
				),
			});
		} catch (error) {
			console.error(error);
			setDialogState(DialogState.Error);
			setAlertDialogContent({
				title: "Compress cancelled",
				message: `${error instanceof Error ? error.message : "Unknown error"}`,
			});
		}
	};

	const decompress = async (mint: PublicKey, amount: BN) => {
		try {
			if (!connected || !publicKey || !signTransaction)
				throw new WalletNotConnectedError();

			setAlertDialogOpen(true);
			setDialogState(DialogState.ConfirmingTransaction);
			setAlertDialogContent({
				title: "Confirming Transaction",
				message: "Please confirm the transaction in your wallet...",
			});

			const ixs = [
				ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }),
			];

			const destinationAta = await getAssociatedTokenAddress(mint, publicKey);
			const isAtaInitialize = await isAccountInitialized({
				connection,
				address: destinationAta,
			});
			if (!isAtaInitialize) {
				const createAtaIx = createAssociatedTokenAccountInstruction(
					publicKey,
					destinationAta,
					publicKey,
					mint,
				);

				ixs.push(createAtaIx);
			}

			// get compressed token account
			const compressedTokenAccounts =
				await compressionRpc.getCompressedTokenAccountsByOwner(publicKey, {
					mint: mint,
				});

			const { compressedProof, rootIndices } =
				await compressionRpc.getValidityProof(
					compressedTokenAccounts.items.map((account) =>
						bn(account.compressedAccount.hash),
					),
				);

			const [inputAccounts] = selectMinCompressedTokenAccountsForTransfer(
				compressedTokenAccounts.items,
				amount,
			);

			const decompressIx = await CompressedTokenProgram.decompress({
				payer: publicKey,
				inputCompressedTokenAccounts: inputAccounts,
				toAddress: destinationAta,
				amount: amount,
				recentValidityProof: compressedProof,
				recentInputStateRootIndices: rootIndices,
			});

			ixs.push(decompressIx);

			const { value: blockhashCtx } =
				await connection.getLatestBlockhashAndContext();
			const tx = buildTx(ixs, publicKey, blockhashCtx.blockhash);

			const signedTx = await signTransaction(tx);

			setDialogState(DialogState.Processing);
			setAlertDialogContent({
				title: "Confirming Transaction",
				message: "Please wait while the transaction is being confirmed...",
			});

			const txId = await sendAndConfirmTx(rpc, signedTx);

			// refecth tokens
			// wait a bit before refetch
			setTimeout(() => {
				refetchTokenAccounts();
				refetchCompressedTokenAccounts();
			}, 3000);

			setDialogState(DialogState.Success);
			setAlertDialogContent({
				title: "Token compress successfully",
				message: (
					<a href={`https://photon.helius.dev/tx/${txId}?cluster=mainnet-beta`}>
						Transaction ID: ${txId}
					</a>
				),
			});
		} catch (error) {
			console.error(error);
			setDialogState(DialogState.Error);
			setAlertDialogContent({
				title: "Decompress cancelled",
				message: `${error instanceof Error ? error.message : "Unknown error"}`,
			});
		}
	};

	return (
		<div className="w-full max-w-screen-sm h-full p-4 flex flex-col gap-4">
			{/* page content */}
			<nav className="flex flex-row items-top justify-between">
				<div>
					<h1 className="text-xl font-bold font-mono">POINT0x (COMPRESSOR)</h1>
					<span className="font-mono text-stone-300">NO MORE 0.002 SOL</span>
				</div>
				<WalletButton />
			</nav>
			<CompressedSwapCard
				setAlertDialogOpen={(open: boolean) => setAlertDialogOpen(open)}
				setDialogState={(dialogState: DialogState) =>
					setDialogState(dialogState)
				}
				setAlertDialogContent={(dialogConent: {
					title: string;
					message: string | ReactNode;
				}) => setAlertDialogContent(dialogConent)}
			/>
			<div className="flex flex-1">
				{isLoading ? (
					<div className="border border-white rounded-lg w-full h-full flex items-center justify-center gap-">
						<Loader2 className="h-8 w-8 animate-spin" />
						<span className="text-xl">Loading Token...</span>
					</div>
				) : userTokenAccounts && userTokenAccounts.length > 0 ? (
					<div className="border border-white rounded-lg w-full h-full">
						<TokenList
							tokenAccounts={userTokenAccounts}
							isLoading={isLoading}
							compress={compress}
							decompress={decompress}
						/>
					</div>
				) : (
					<div className="border border-white rounded-lg w-full h-full flex items-center justify-center">
						<p className="text-xl">No tokens found.</p>
					</div>
				)}
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
					{(dialogState === DialogState.Success ||
						dialogState === DialogState.Error) && (
						<AlertDialogFooter>
							<AlertDialogCancel
								onClick={() => {
									setAlertDialogOpen(false);
									setDialogState(DialogState.Idle);
								}}
							>
								Close
							</AlertDialogCancel>
						</AlertDialogFooter>
					)}
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
