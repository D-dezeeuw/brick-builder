import Fastify from 'fastify';

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = Fastify({
  logger: {
    transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
  },
});

app.get('/health', async () => ({ status: 'ok', service: 'brick-builder-server' }));

app
  .listen({ port: PORT, host: HOST })
  .then((addr) => app.log.info(`listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
