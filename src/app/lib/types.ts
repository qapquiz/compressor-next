import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";

export const TokenMetadataSchema = z.object({
	mint: z.string(),
	symbol: z.string(),
	image: z.string(),
	decimals: z.number(),
});

export type ZodTokenMetadata = z.infer<typeof TokenMetadataSchema>;

export type TokenAmount = {
	amount: string;
	decimals: number;
	uiAmount: number;
	uiAmountString: string;
};

export type TokenAccountInfo = {
	isNative: boolean;
	mint: string;
	owner: string;
	state: string;
	tokenAmount: TokenAmount;
};

export type ParsedTokenAccountData = {
	info: TokenAccountInfo;
	type: string;
};

export type WithTokenMetadata<T> = {
	token: T;
	metadata: ZodTokenMetadata;
};

export type Token = {
	mint: PublicKey;
	symbol: string;
	decimals: number;
	image: string;
};

export type TokenAccount = Token & {
	amount: BN;
	pricePerToken: number;
	tokenType: "spl" | "compressed";
};

export type JUPQuoteResponse = {
	inputMint: string;
	inAmount: string;
	outputMint: string;
	outAmount: string;
	swapMode: "ExactIn";
	slippageBps: number;
	priceImpactPct: string;
}
