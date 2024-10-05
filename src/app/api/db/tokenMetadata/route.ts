import { db } from "@/server/db/db";
import type { TokenMetadata } from "@prisma/client";

// findTokenMetadata by mint string
export async function GET(request: Request): Promise<Response> {
	try {
		const url = new URL(request.url);
		const searchParams = url.searchParams;
		const mints = searchParams.get("mints")?.split(",");

		if (!mints) {
			return Response.json([] as TokenMetadata[]);
		}

		const tokenMetadata = (await db.tokenMetadata.findMany({
			where: {
				mint: {
					in: mints,
				},
			},
		})) as TokenMetadata[];

		return Response.json(tokenMetadata);
	} catch (error) {
		console.error(error);
		return Response.json([] as TokenMetadata[]);
	}
}

// createTokenMetadata by TokenMetadata type
export async function POST(request: Request) {
	const json = await request.json();
	const tokenMetadata = json as TokenMetadata[];

	try {
		const existing = await db.tokenMetadata.findMany({
			select: {
				mint: true,
			},
			where: {
				mint: {
					in: tokenMetadata.map((metadata) => metadata.mint),
				},
			},
		});

		const existingMintsSet = new Set(existing.map((mintObj) => mintObj.mint));
		console.log("existing:", existingMintsSet);
		const willInsertMints = tokenMetadata.filter(
			(metadata) => !existingMintsSet.has(metadata.mint),
		);
		console.log("will insert:", willInsertMints);

		if (willInsertMints.length <= 0) {
			return Response.json({ ok: true });
		}

		await db.tokenMetadata.createMany({
			data: willInsertMints,
		});

		return Response.json({ ok: true });
	} catch (error) {
		console.error(error);

		return Response.json({ ok: false });
	}
}
