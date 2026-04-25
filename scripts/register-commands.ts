import fetch from 'node-fetch';
import { COMMANDS } from '../src/commands';

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID) {
	throw new Error('DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID are required');
}

const REGISTER_COMMANDS_URL = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`;

const payload = Object.values(COMMANDS).map(
	({ name, description, default_member_permissions }) => ({
		name,
		description,
		default_member_permissions
	})
);

async function run() {
	const response = await fetch(REGISTER_COMMANDS_URL, {
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bot ${DISCORD_BOT_TOKEN}`
		},
		method: 'PUT',
		body: JSON.stringify(payload)
	});

	if (response.ok) {
		console.log('Registered all commands');
	} else {
		console.error('Error registering commands');
		const text = await response.text();
		console.error(text);
	}
	return response;
}

run()
	.catch(console.error)
	.then(() => console.log('Completed'));
