"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowDown, Atom, Loader2 } from "lucide-react";
import { z } from "zod";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useForm } from "react-hook-form";
import type { Control, UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "./ui/form";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { JUPQuoteResponse, TokenAccount } from "@/app/lib/types";
import { useQuery } from "@tanstack/react-query";
import { createRpc } from "@lightprotocol/stateless.js";
import type { Rpc } from "@lightprotocol/stateless.js";
import { env } from "@/env/client";
import { getCompressedTokens, getTokens } from "@/app/lib/solana";
import { WalletButton } from "./solana/solana-provider";
import { debounce } from "@/lib/utils";
import { BN } from "@coral-xyz/anchor";

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
}

const TokenSelectionWithAmount = (
	{
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
		mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
		symbol: "USDC",
	}

	function showCompressedIcon(isCompressed: boolean) {
		return isCompressed ? (
			<Atom className="w-4 h-4 text-[#f2d3ab]" />
		) : (
			<></>
		);
	}

	const useDefaultIfNoLoading = () => {
		if (isLoading === undefined) {
			return (
				<SelectItem
					value={defaultToken.mint}
				>
					{defaultToken.symbol}
				</SelectItem>
			)
		}

		return tokenAccounts?.map((tokenAccount) => (
			<SelectItem
				key={`${tokenAccount.mint.toBase58()}-${tokenAccount.tokenType}`}
				value={`${tokenAccount.mint.toBase58()}-${tokenAccount.tokenType}`}
			>
				<div className="flex flew-row gap-1 items-center justify-center">
					{tokenAccount.symbol} {showCompressedIcon(tokenAccount.tokenType === "compressed")}
				</div>
			</SelectItem>
		));
	}

	return (
		<div className="flex flex-col w-full items-end">
			{
				showMax && (
					<button
						type="button"
						onClick={() => {
							// @ts-ignore
							form.setValue("exactInAmount", maxAmount ?? "0.00")
						}}
						onKeyUp={() => { }}
						className="flex flex-row gap-1"
					>
						<span className="text-xs font-mono">{maxAmount}</span>
						<span className="text-xs font-mono">MAX</span>
					</button>
				)
			}
			<div className="flex flex-row gap-1 w-full">
				<div className="min-w-[30%] max-w-[30%]">
					<FormField
						control={form.control}
						name={inputSelectName}
						render={({ field }) => (
							<FormItem className="grow-[1]">
								<FormControl>
									<Select onValueChange={field.onChange} defaultValue={field.value.toString()} disabled={disabled}>
										<SelectTrigger className="w-full">
											<div className="flex flex-row items-center justify-center">
												{
													isLoading ?
														(
															<Loader2 className="h-4 w-4 animate-spin" />
														) :
														(
															<SelectValue placeholder="???" />
														)
												}
											</div>
										</SelectTrigger>
										<SelectContent>
											{
												useDefaultIfNoLoading()
											}
										</SelectContent>
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
								<Input className="text-right" type="number" placeholder="0.00" disabled={disabled} {...field} isLoading={isQuoting}/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
			</div>
		</div >
	);
};

const compressionRpc: Rpc = createRpc(
	env.NEXT_PUBLIC_HELIUS_RPC_URL,
	env.NEXT_PUBLIC_HELIUS_RPC_URL,
);

export function CompressedSwapCard(props: SwapCardProps) {
	const { connected, publicKey } = useWallet();
	const { connection } = useConnection();
	const [isQuoting, setIsQuoting] = useState(false);

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
	}, [tokenAccounts, compressedTokenAccounts])

	const form = useForm<SwapFormData>({
		resolver: zodResolver(SwapFormDataSchema),
		defaultValues: {
			fromTokenMint: "",
			toTokenMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
			// @ts-ignore: force string to be nice ui form
			exactInAmount: "",
			// @ts-ignore: force string to be nice ui form
			outAmount: "0.00",
		},
	})

	const fromTokenMintValue = form.watch("fromTokenMint");
	const toTokenMintValue = form.watch("toTokenMint");
	const exactInAmountValue = form.watch("exactInAmount");

	const maxAmountForInput = useMemo(() => {
		if (!fromTokenMintValue) return;

		const [inputMint] = fromTokenMintValue.split("-");
		const tokenAccount = (combinedTokenAccounts ?? []).find((account) => account.mint.toBase58() === inputMint);
		const decimals = tokenAccount?.decimals ?? 0;
		const maxAmount = (tokenAccount?.amount ?? 0) / (10 ** decimals);

		return maxAmount.toFixed(4);
	}, [fromTokenMintValue, combinedTokenAccounts])

	const debouncedOnChange = useCallback(
		debounce(async (combinedTokenAccounts: TokenAccount[], fromTokenMint: string, toTokenMint: string, exactInAmount: number) => {
			if (!fromTokenMint || !toTokenMint || !exactInAmount) {
				return;
			}

			const [inputMint] = fromTokenMint.split("-");
			const tokenAccount = combinedTokenAccounts.find((account) => account.mint.toBase58() === inputMint);
			const inputAmount = 10 ** (tokenAccount?.decimals ?? 0) * exactInAmount;

			setIsQuoting(true);
			const quoteFetchResponse = await fetch(
				`https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${toTokenMint}&amount=${inputAmount}&slippageBps=300`
			);
			const quoteResponseJson = (await quoteFetchResponse.json()) as JUPQuoteResponse;
			const amountTimesDecimal = new BN(quoteResponseJson.outAmount) / (10 ** 6);
			setIsQuoting(false);

			// @ts-ignore
			form.setValue("outAmount", amountTimesDecimal.toString());
		}, 500), []);

	useEffect(() => {
		if (!combinedTokenAccounts) {
			return;
		}

		debouncedOnChange(combinedTokenAccounts, fromTokenMintValue, toTokenMintValue, exactInAmountValue);
	}, [combinedTokenAccounts, fromTokenMintValue, toTokenMintValue, exactInAmountValue, debouncedOnChange]);

	const onSubmit = useCallback(async (values: SwapFormData) => {
		if (!connected || !publicKey) {
			return;
		}

		const allTokenAccounts = tokenAccounts?.concat(compressedTokenAccounts);

		const [inputMint] = values.fromTokenMint.split("-");
		const tokenAccount = allTokenAccounts?.find((account) => account.mint.toBase58() === inputMint);
		const realAmount = 10 ** (tokenAccount?.decimals ?? 0) * values.exactInAmount;
	}, [connected, publicKey, compressedTokenAccounts]);

	return (
		<>
			<WalletButton />
			<Form {...form}>
				<form onSubmit={form.handleSubmit(onSubmit)}>
					<Card className="max-w-screen-sm border-white">
						<CardHeader>
							<CardTitle>Compressed Token Swap</CardTitle>
							<CardDescription className="font-mono">{"Decompress -> Swap -> Compress"}</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="flex flex-col items-center gap-4">
								<TokenSelectionWithAmount
									form={form}
									inputSelectName="fromTokenMint"
									inputAmountName="exactInAmount"
									showMax
									maxAmount={maxAmountForInput}
									isLoading={isLoadingTokenAccounts && isLoadingCompressedTokenAccounts}
									tokenAccounts={[...(tokenAccounts ?? []), ...compressedTokenAccounts]}
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
		</>
	);
}
