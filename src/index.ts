import { Hono } from 'hono';
import { discordApp } from './discord';
import { githubApp } from './github';

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('discord-bot ok'));
app.route('/discord', discordApp);
app.route('/github', githubApp);

export default app;
