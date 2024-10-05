import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	client: {
		NEXT_PUBLIC_HELIUS_RPC_URL: z.string().url(),
		NEXT_PUBLIC_SYNDICA_RPC_URL: z.string().url(),
	},
	experimental__runtimeEnv: {
		NEXT_PUBLIC_HELIUS_RPC_URL: process.env.NEXT_PUBLIC_HELIUS_RPC_URL,
		NEXT_PUBLIC_SYNDICA_RPC_URL: process.env.NEXT_PUBLIC_SYNDICA_RPC_URL,
	},
});
