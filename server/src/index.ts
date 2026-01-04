import { createApp } from './app';

const rawPort = process.env.PORT ?? '3000';
const port = Number.parseInt(rawPort, 10);

if (Number.isNaN(port)) {
  throw new Error(`Invalid PORT: ${rawPort}`);
}

const app = createApp();

app.listen(port, () => {
  console.log(`server listening on port ${port}`);
});
