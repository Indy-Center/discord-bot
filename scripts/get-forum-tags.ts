const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const channelId = process.argv[2];

if (!DISCORD_BOT_TOKEN) {
	throw new Error('DISCORD_BOT_TOKEN is required');
}
if (!channelId) {
	throw new Error('Usage: npm run forum-tags -- <channel_id>');
}

async function run() {
	const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
		headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
	});
	if (!res.ok) {
		console.error(`Failed: ${res.status} ${await res.text()}`);
		process.exit(1);
	}

	const body = (await res.json()) as {
		name?: string;
		available_tags?: Array<{ id: string; name: string }>;
	};

	if (!body.available_tags) {
		console.error('No available_tags on this channel (is it a forum?)');
		process.exit(1);
	}

	console.log(`Forum: ${body.name ?? channelId}`);
	for (const tag of body.available_tags) {
		console.log(`  ${tag.name.padEnd(24)} ${tag.id}`);
	}
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
