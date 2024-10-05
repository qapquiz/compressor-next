import { TokenMetadata } from "@prisma/client";

export async function findTokenMetadataInDB(mints: string[]): Promise<TokenMetadata[]> {
	try {
		const response = await fetch(`/api/db/tokenMetadata?mints=${mints.join(",")}`);
		return await response.json();
	} catch (error) {
		console.error(error);
	}

	return [];
}

export async function insertTokenMetadata(tokenMetadata: TokenMetadata[]): Promise<{ ok: boolean }> {
	try {
		const response = await fetch(
			"/api/db/tokenMetadata",
			{
				method: "POST",
				body: JSON.stringify(tokenMetadata)
			}
		);

		return await response.json();
	} catch (error) {
		console.error(error);
	}

	return { ok: false };
}
