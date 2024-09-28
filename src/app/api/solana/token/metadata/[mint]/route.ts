import { removeTrailingCommas } from "@/app/lib/json";
import { TokenMetadata, TokenMetadataSchema } from "@/app/lib/types";
import { fetchDigitalAsset, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { PublicKey } from "@solana/web3.js";

const TOKEN_IMAGE_URL: Record<string, string> = {
	"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png", // USDC
}

export async function GET(_request: Request, { params }: { params: { mint: string } }) {
	const mint = params.mint;

	const endpoint = process.env.SYNDICA_RPC;
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
			} as TokenMetadata
		);
	}

	console.log("digitalAsset", digitalAsset.metadata.name);
	console.log("uri", digitalAsset.metadata.uri)

	// get token from metadata
	const metadataResponse = await fetch(digitalAsset.metadata.uri);
	// some of the metadata contain trailing comma
	const jsonText = JSON.parse(removeTrailingCommas(await metadataResponse.text()));
	const metadata = {
		...jsonText,
		decimals: digitalAsset.mint.decimals,
	};

	TokenMetadataSchema.parse(metadata);

	return Response.json(metadata);
}
