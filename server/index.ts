import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load .env before importing modules that read settings when they load. A missing file is fine:
// hosts set variables directly.
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const [{ createApp }, { createCaptcha }, { loadConfig }, geo, research] = await Promise.all([
  import('./app.js'),
  import('./captcha.js'),
  import('./config.js'),
  import('./geo/index.js'),
  import('./research/index.js'),
]);

const config = loadConfig(process.env);

const app = createApp({
  config,
  captcha: createCaptcha({ secret: config.captchaSecret }),
  geo: {
    searchPlaces: geo.searchPlaces,
    reversePlace: geo.reversePlace,
    getLocationContext: geo.getLocationContext,
  },
  research: {
    researchConfigured: () => research.researchConfigured(process.env),
    investigate: research.investigate,
  },
});

const server = createServer(app);

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${config.port} is already used by another program. Set PORT in .env to a free port and restart.`);
    process.exit(1);
  }
  throw error;
});

server.listen(config.port, config.host, () => {
  console.log(`fixplease.work ready at http://${config.host}:${config.port}`);
});
