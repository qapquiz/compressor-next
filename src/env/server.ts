import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	server: {
		HELIUS_RPC_URL: z.string().url(),
		SYNDICA_RPC_URL: z.string().url(),
		DATABASE_URL: z.string().url(),
		NODE_ENV: z.enum(["development", "production"]).default("development"),
	},
	experimental__runtimeEnv: process.env,
});
