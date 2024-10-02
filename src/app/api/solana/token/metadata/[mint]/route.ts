import { removeTrailingCommas } from "@/app/lib/json";
import { type TokenMetadata, TokenMetadataSchema } from "@/app/lib/types";
import { env } from "@/env/server";
import { fetchDigitalAsset, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { PublicKey } from "@solana/web3.js";

const TOKEN_IMAGE_URL: Record<string, string> = {
	"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png", // USDC
	"orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png", // orca
	"JxxWsvm9jHt4ah7DT9NuLyVLYZcZLUdPD93PcPQ71Ka": "https://i.pinimg.com/originals/cb/87/f6/cb87f6e8152961be45a5642ef72c391f.jpg",
}

export async function GET(_request: Request, { params }: { params: { mint: string } }) {
	const mint = params.mint;

	const endpoint = env.SYNDICA_RPC_URL;
	if (!endpoint) {
		throw new Error("No environment variable SYNDICA_RPC");
	}
	const umi = createUmi(endpoint)
		.use(mplTokenMetadata());

	const digitalAsset = await fetchDigitalAsset(umi, fromWeb3JsPublicKey(new PublicKey(mint)))

	// find token image in local list first
	if (TOKEN_IMAGE_URL[digitalAsset.publicKey]) {
		return Response.json(
			{
				name: digitalAsset.metadata.name,
				symbol: digitalAsset.metadata.symbol,
				image: TOKEN_IMAGE_URL[digitalAsset.publicKey],
				decimals: digitalAsset.mint.decimals,
				isCompressed: false,
			} as TokenMetadata
		);
	}

	// get token from metadata
	const metadataResponse = await fetch(digitalAsset.metadata.uri);
	// some of the metadata contain trailing comma
	const jsonText = JSON.parse(removeTrailingCommas(await metadataResponse.text()));
	const metadata = {
		...jsonText,
		decimals: digitalAsset.mint.decimals,
		isCompressed: false,
	};

	TokenMetadataSchema.parse(metadata);

	return Response.json(metadata);
}
