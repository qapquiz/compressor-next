import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";


export const env = createEnv({
	server: {
		HELIUS_RPC_URL: z.string().url(),
		SYNDICA_RPC_URL: z.string().url(),
	},
	experimental__runtimeEnv: process.env,
});
