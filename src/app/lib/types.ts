import { z } from "zod";

export const TokenMetadataSchema = z.object({
	name: z.string(),
	symbol: z.string(),
	image: z.string(),
	decimals: z.number(),
});

export type TokenMetadata = z.infer<typeof TokenMetadataSchema>

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
	metadata: TokenMetadata;
}
