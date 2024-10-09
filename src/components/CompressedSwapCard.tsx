"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowDown, Atom, Loader2 } from "lucide-react";
import { z } from "zod";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useForm } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "./ui/form";
import {
	ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { JUPQuoteResponse, TokenAccount } from "@/app/lib/types";
import { useQuery } from "@tanstack/react-query";
import { bn, createRpc, sendAndConfirmTx } from "@lightprotocol/stateless.js";
import type { Rpc } from "@lightprotocol/stateless.js";
import { env } from "@/env/client";
import {
	getCompressedTokens,
	getTokens,
	toLamports,
	toUIAmount,
} from "@/app/lib/solana";
import { debounce } from "@/lib/utils";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { BigNumber } from "bignumber.js";
import { Effect } from "effect";
import { createCompressedTokenSwapEffect, createTokenSwapEffect } from "@/app/lib/swap";
import { DialogState } from "./PortfolioPage";

const SwapFormDataSchema = z.object({
	fromTokenMint: z.string().min(1, {
		message: "Please select a token.",
	}),
	toTokenMint: z.string().min(1, {
		message: "Please select a token.",
	}),
	exactInAmount: z
		.string()
		.transform((val) => {
			return Number.parseFloat(val);
		})
		.refine((val) => val > 0, "exactInAmount must be greater than 0"),
	outAmount: z
		.string()
		.transform((val) => {
			return Number.parseFloat(val);
		})
		.refine((val) => val > 0, "outAmount must be greater than 0"),
});

type SwapFormData = z.infer<typeof SwapFormDataSchema>;

type SwapCardProps = {
	setAlertDialogOpen: (open: boolean) => void;
	setDialogState: (dialogState: DialogState) => void;
	setAlertDialogContent: (dialogContent: {
		title: string;
		message: string | ReactNode;
	}) => void;
};

type TokenSelectionWithAmountProps = {
	form: UseFormReturn<SwapFormData, unknown, undefined>;
	inputSelectName: keyof SwapFormData;
	inputAmountName: keyof SwapFormData;
	showMax?: boolean;
	maxAmount?: string;
	disabled?: boolean;
	isLoading?: boolean;
	tokenAccounts?: TokenAccount[];
	isQuoting?: boolean;
};

const TokenSelectionWithAmount = ({
	form,
	inputSelectName,
	inputAmountName,
	showMax,
	maxAmount,
	disabled,
	isLoading,
	tokenAccounts,
	isQuoting,
}: TokenSelectionWithAmountProps) => {
	const defaultToken = {
		// mint: "So11111111111111111111111111111111111111112",
		// symbol: "SOL",
		mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		symbol: "USDC",
	};

	function showCompressedIcon(isCompressed: boolean) {
		return isCompressed ? <Atom className="w-4 h-4 text-[#f2d3ab]" /> : <></>;
	}

	const useDefaultIfNoLoading = () => {
		if (isLoading === undefined) {
			return (
				<SelectItem value={defaultToken.mint}>{defaultToken.symbol}</SelectItem>
			);
		}

		return tokenAccounts?.map((tokenAccount) => (
			<SelectItem
				key={`${tokenAccount.mint.toBase58()}-${tokenAccount.tokenType}`}
				value={`${tokenAccount.mint.toBase58()}-${tokenAccount.tokenType}`}
			>
				<div className="flex flew-row gap-1 items-center justify-center">
					{tokenAccount.symbol}{" "}
					{showCompressedIcon(tokenAccount.tokenType === "compressed")}
				</div>
			</SelectItem>
		));
	};

	return (
		<div className="flex flex-col w-full items-end">
			{showMax && (
				<button
					type="button"
					onClick={() => {
						// @ts-ignore
						form.setValue("exactInAmount", maxAmount ?? "0.00");
					}}
					onKeyUp={() => { }}
					className="flex flex-row gap-1"
				>
					<span className="text-xs font-mono">{maxAmount}</span>
					<span className="text-xs font-mono">MAX</span>
				</button>
			)}
			<div className="flex flex-row gap-1 w-full">
				<div className="min-w-[30%] max-w-[30%]">
					<FormField
						control={form.control}
						name={inputSelectName}
						render={({ field }) => (
							<FormItem className="grow-[1]">
								<FormControl>
									<Select
										onValueChange={field.onChange}
										defaultValue={field.value.toString()}
										disabled={disabled}
									>
										<SelectTrigger className="w-full">
											<div className="flex flex-row items-center justify-center">
												{isLoading ? (
													<Loader2 className="h-4 w-4 animate-spin" />
												) : (
													<SelectValue placeholder="???" />
												)}
											</div>
										</SelectTrigger>
										<SelectContent>{useDefaultIfNoLoading()}</SelectContent>
									</Select>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
				<FormField
					control={form.control}
					name={inputAmountName}
					render={({ field }) => (
						<FormItem className="grow-[3]">
							<FormControl>
								<Input
									className="text-right"
									type="number"
									placeholder="0.00"
									disabled={disabled}
									{...field}
									isLoading={isQuoting}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>
		</div>
	);
};

const compressionRpc: Rpc = createRpc(
	env.NEXT_PUBLIC_HELIUS_RPC_URL,
	env.NEXT_PUBLIC_HELIUS_RPC_URL,
);

export function CompressedSwapCard({
	setAlertDialogOpen,
	setDialogState,
	setAlertDialogContent,
}: SwapCardProps) {
	const { connected, publicKey, signTransaction, signAllTransactions } =
		useWallet();
	const { connection } = useConnection();
	const [isQuoting, setIsQuoting] = useState(false);
	const [quoteResponse, setQuoteResponse] = useState<
		JUPQuoteResponse | undefined
	>(undefined);

	const rpc = useMemo(
		() => createRpc(connection.rpcEndpoint, connection.rpcEndpoint),
		[connection.rpcEndpoint],
	);

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
			if (!connected || !publicKey) {
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

	const combinedTokenAccounts = useMemo(() => {
		return tokenAccounts?.concat(compressedTokenAccounts ?? []);
	}, [tokenAccounts, compressedTokenAccounts]);

	const form = useForm<SwapFormData>({
		resolver: zodResolver(SwapFormDataSchema),
		defaultValues: {
			fromTokenMint: "",
			// toTokenMint: "So11111111111111111111111111111111111111112",
			toTokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
			// @ts-ignore: force string to be nice ui form
			exactInAmount: "",
			// @ts-ignore: force string to be nice ui form
			outAmount: "0.00",
		},
	});

	const fromTokenMintValue = form.watch("fromTokenMint");
	const toTokenMintValue = form.watch("toTokenMint");
	const exactInAmountValue = form.watch("exactInAmount");

	const maxAmountForInput = useMemo(() => {
		if (!fromTokenMintValue) return;

		const [inputMint] = fromTokenMintValue.split("-");
		const tokenAccount = (combinedTokenAccounts ?? []).find(
			(account) => account.mint.toBase58() === inputMint,
		);

		if (!tokenAccount) return "0";

		return (
			new BN(tokenAccount.amount) / new BN(10 ** tokenAccount.decimals)
		).toString();
	}, [fromTokenMintValue, combinedTokenAccounts]);

	const getQuoteResponseFromJup = useCallback(
		async (inputMint: string, toTokenMint: string, inputAmountBN: BN) => {
			const quoteFetchResponse = await fetch(
				`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${toTokenMint}&amount=${inputAmountBN.toString()}&slippageBps=300`,
			);
			const quoteResponseJson =
				(await quoteFetchResponse.json()) as JUPQuoteResponse;
			setQuoteResponse(quoteResponseJson);

			return quoteResponseJson;
		},
		[],
	);

	const debouncedOnChange = useCallback(
		debounce(
			async (
				combinedTokenAccounts: TokenAccount[],
				fromTokenMint: string,
				toTokenMint: string,
				exactInAmount: number,
			) => {
				if (!(fromTokenMint && toTokenMint && exactInAmount)) {
					return;
				}

				const [inputMint] = fromTokenMint.split("-");
				const tokenAccount = combinedTokenAccounts.find(
					(account) => account.mint.toBase58() === inputMint,
				);

				if (!tokenAccount) return;

				const exactInAmountBigNumber = new BigNumber(exactInAmount);
				const multiplierBigNumber = new BigNumber(10 ** tokenAccount.decimals);
				const inputAmount =
					exactInAmountBigNumber.multipliedBy(multiplierBigNumber);
				const inputAmountBN = bn(inputAmount.toString());

				setIsQuoting(true);
				const quoteResponseJson = await getQuoteResponseFromJup(
					inputMint,
					toTokenMint,
					inputAmountBN,
				);
				const decimals = 6;
				const amountTimesDecimal = toUIAmount(
					quoteResponseJson.outAmount,
					decimals,
				);
				setIsQuoting(false);

				// @ts-ignore
				form.setValue("outAmount", amountTimesDecimal.toString());
			},
			500,
		),
		[],
	);

	useEffect(() => {
		if (!combinedTokenAccounts) {
			return;
		}

		debouncedOnChange(
			combinedTokenAccounts,
			fromTokenMintValue,
			toTokenMintValue,
			exactInAmountValue,
		);
	}, [
		combinedTokenAccounts,
		fromTokenMintValue,
		toTokenMintValue,
		exactInAmountValue,
		debouncedOnChange,
	]);

	const onSubmit = useCallback(
		async (values: SwapFormData) => {
			if (!(connected && publicKey && quoteResponse && signTransaction)) {
				return;
			}

			try {
				setAlertDialogOpen(true);
				setDialogState(DialogState.ConfirmingTransaction);
				setAlertDialogContent({
					title: "Confirming Transaction",
					message: "Please confirm the transaction in your wallet...",
				});

				const allTokenAccounts = combinedTokenAccounts;

				const [inputMint] = values.fromTokenMint.split("-");
				const tokenAccount = allTokenAccounts?.find(
					(account) => account.mint.toBase58() === inputMint,
				);
				if (!tokenAccount) {
					return;
				}
				const swapAmount = toLamports(
					values.exactInAmount,
					tokenAccount.decimals,
				);

				let tx: VersionedTransaction;
				if (tokenAccount.tokenType === "spl") {
					tx = await Effect.runPromise(
						createTokenSwapEffect({
							connection,
							publicKey,
							quoteResponse,
						}),
					);
				} else {
					tx = await Effect.runPromise(
						createCompressedTokenSwapEffect({
							connection,
							compressionRpc,
							publicKey,
							tokenAMint: tokenAccount.mint,
							tokenBMint: new PublicKey(toTokenMintValue),
							amount: swapAmount,
							quoteResponse,
						}),
					);
				}

				// const tx = await Effect.runPromise(
				// 	createCompressedTokenSwapEffect({
				// 		connection,
				// 		compressionRpc,
				// 		publicKey,
				// 		tokenAMint: tokenAccount.mint,
				// 		tokenBMint: new PublicKey(toTokenMintValue),
				// 		amount: swapAmount,
				// 		quoteResponse,
				// 	}),
				// );

				console.log("tx.length", tx.serialize().length);

				const signedTx = await signTransaction(tx);

				setDialogState(DialogState.Processing);
				setAlertDialogContent({
					title: "Confirming Transaction",
					message: "Please wait while the transaction is being confirmed...",
				});

				const txId = await sendAndConfirmTx(rpc, signedTx);

				setDialogState(DialogState.Success);
				setAlertDialogContent({
					title: "Swap successfully",
					message: (
						<a className="link link-primary" href={`https://photon.helius.dev/tx/${txId}?cluster=mainnet-beta`} target="_blank" rel="noreferrer">
							Transaction: https://proton.helius.dev/tx/{txId.slice(0, 4)}...{txId.slice(-4)}
						</a>
					),
				});
			} catch (error) {
				console.error(error);
				setDialogState(DialogState.Error);
				setAlertDialogContent({
					title: "Swap cancelled",
					message: `${error instanceof Error ? error.message : "Unknown error"}`,
				});
			}
		},
		[
			connected,
			publicKey,
			signTransaction,
			quoteResponse,
			rpc,
			toTokenMintValue,
			connection,
			setAlertDialogOpen,
			setAlertDialogContent,
			setDialogState,
			combinedTokenAccounts,
		],
	);

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<Card className="max-w-screen-sm border-white">
					<CardHeader>
						<CardTitle>Compressed Token Swap</CardTitle>
						<CardDescription className="font-mono">
							{"Decompress -> Swap -> Compress"}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex flex-col items-center gap-4">
							<TokenSelectionWithAmount
								form={form}
								inputSelectName="fromTokenMint"
								inputAmountName="exactInAmount"
								showMax
								maxAmount={maxAmountForInput}
								isLoading={
									isLoadingTokenAccounts && isLoadingCompressedTokenAccounts
								}
								tokenAccounts={[
									...(tokenAccounts ?? []),
									...compressedTokenAccounts,
								]}
							/>
							<ArrowDown className="border rounded-md p-2" size={"40px"} />
							<TokenSelectionWithAmount
								form={form}
								inputSelectName="toTokenMint"
								inputAmountName="outAmount"
								disabled={true}
								isQuoting={isQuoting}
							/>
						</div>
					</CardContent>
					<CardFooter>
						<Button type="submit" className="w-full font-bold font-mono">
							SWAP
						</Button>
					</CardFooter>
				</Card>
			</form>
		</Form>
	);
}
