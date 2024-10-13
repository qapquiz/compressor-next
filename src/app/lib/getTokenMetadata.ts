import { Console, Effect } from "effect";
import { PublicKey } from "@solana/web3.js";
import type { TokenMetadata } from "@prisma/client";
import type { HeliusAssetBatch, JUPPriceResponse, TokenMetadataWithPrice } from "./solana";
import { env } from "@/env/client";

type GetTokenMetadataResult = {
	founds: TokenMetadata[];
	notFoundMints: PublicKey[];
}

type GetTokenMetadataWithPriceResult = {
	founds: TokenMetadataWithPrice[];
	notFoundMints: PublicKey[];
}

function getTokenMetadataFromDB(
	mints: PublicKey[]
): Effect.Effect<GetTokenMetadataResult, never, never> {
	return Effect.promise(async () => {
		const mintsString = mints.map((mint) => mint.toBase58());
		const response = await fetch(
			`/api/db/tokenMetadata?mints=${mintsString.join(",")}`,
		);
		const tokenMetadata = (await response.json()) as TokenMetadata[];
		const tokenMetadataMap = new Map(
			tokenMetadata.map((tokenMetadata) => [tokenMetadata.mint, tokenMetadata]),
		);
		const notFoundMints = mintsString.filter((mint) => !tokenMetadataMap.has(mint));

		return {
			founds: tokenMetadata,
			notFoundMints: notFoundMints.map((mintString) => new PublicKey(mintString)),
		}
	});
}

function getTokenMetadataFromOnChain(
	mints: PublicKey[]
): Effect.Effect<GetTokenMetadataResult, never, never> {
	return Effect.promise(async () => {
		const mintString = mints.map((mint) => mint.toBase58());

		const founds: TokenMetadata[] = [];
		const notFoundMints: PublicKey[] = [];
		for (const mint of mintString) {
			const response = await fetch(`/api/solana/token/metadata/${mint}`);
			const tokenMetadata = (await response.json()) as TokenMetadata;

			if (!tokenMetadata.symbol && tokenMetadata.decimals === 0) {
				notFoundMints.push(new PublicKey(mint));
			} else {
				founds.push(tokenMetadata);
			}
		}

		return {
			founds,
			notFoundMints
		};
	});
}

function getTokenMetadataWithPriceFromHelius(
	heliusUrl: string,
	mints: PublicKey[]
): Effect.Effect<GetTokenMetadataWithPriceResult, never, never> {
	return Effect.promise(async () => {
		const mintsString = mints.map((mint) => mint.toBase58());
		if (mints.length === 0) {
			return {
				founds: [],
				notFoundMints: [],
			}
		}

		const response = await fetch(heliusUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: "armry-compressor",
				method: "getAssetBatch",
				params: {
					ids: mintsString,
				},
			}),
		});
		const { result }: { result: HeliusAssetBatch[] } = await response.json();
		const tokenMetadataWithPriceArrayFromHelius = result.map((asset) => {
			return {
				mint: asset.id,
				symbol: asset.token_info?.symbol ?? "",
				decimals: asset.token_info?.decimals ?? 0,
				image: asset.content?.links?.image ?? "",
				pricePerToken: asset.token_info?.price_info?.price_per_token ?? 0,
			} as TokenMetadataWithPrice;
		});

		const tokenMetadataMap = new Map(
			result.map((asset) => [asset.id, asset]),
		);
		const notFoundMints = mintsString.filter((mint) => !tokenMetadataMap.has(mint));

		return {
			founds: tokenMetadataWithPriceArrayFromHelius,
			notFoundMints: notFoundMints.map((mint) => new PublicKey(mint)),
		}
	})
}

function getPriceFromJUP(
	tokenMetadataList: TokenMetadata[]
): Effect.Effect<TokenMetadataWithPrice[], never, never> {
	return Effect.promise(async () => {
		const mintsString = tokenMetadataList.map((tokenMetadata) => tokenMetadata.mint);
		const response = await fetch(
			`https://api.jup.ag/price/v2?ids=${mintsString.join(",")}`,
		);
		const jupResponse = (await response.json()) as JUPPriceResponse;
		const tokenMetadataWithPriceArray: TokenMetadataWithPrice[] =
			tokenMetadataList.map((tokenMetadata) => {
				return {
					...tokenMetadata,
					pricePerToken: Number(jupResponse.data[tokenMetadata.mint]?.price ?? 0),
				};
			});

		return tokenMetadataWithPriceArray;
	});
}

function getTokenMetadataWithPriceEffect(
	mints: PublicKey[]
): Effect.Effect<TokenMetadataWithPrice[], never, never> {
	const program = Effect.Do.pipe(
		Effect.bind("getFromDBResult", () => getTokenMetadataFromDB(mints)),
		Effect.bind("getFromOnChainResult", ({ getFromDBResult }) => getTokenMetadataFromOnChain(getFromDBResult.notFoundMints)),
		Effect.bind("tokenMetadataWithPriceFromJup", ({ getFromDBResult, getFromOnChainResult }) => {
			return getPriceFromJUP([...getFromDBResult.founds, ...getFromOnChainResult.founds]);
		}),
		Effect.bind("tokenMetadataWithPriceFromHelius", ({ getFromOnChainResult }) => {
			return getTokenMetadataWithPriceFromHelius(env.NEXT_PUBLIC_HELIUS_RPC_URL, getFromOnChainResult.notFoundMints);
		}),
		Effect.tap(({ tokenMetadataWithPriceFromHelius }) => Console.log(`notFoundMints: ${tokenMetadataWithPriceFromHelius.notFoundMints}`)),
		Effect.map(({ tokenMetadataWithPriceFromJup, tokenMetadataWithPriceFromHelius }) => {
			return [
				...tokenMetadataWithPriceFromJup,
				...tokenMetadataWithPriceFromHelius.founds,
			];
		}),
	);

	return program;
}

export const findTokenMetadataWithPrice = async (mints: PublicKey[]) => (
	Effect.runPromise(getTokenMetadataWithPriceEffect(mints))
);
