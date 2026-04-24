declare global {
	interface Env {
		KV: KVNamespace;
		DISCORD_PUBLIC_KEY: string;
		DISCORD_BOT_TOKEN: string;
		DISCORD_APPLICATION_ID: string;
		GITHUB_APP_ID: string;
		GITHUB_APP_INSTALLATION_ID: string;
		GITHUB_WEBHOOK_SECRET: string;
		GITHUB_APP_PRIVATE_KEY: string;
	}
}

export {};
