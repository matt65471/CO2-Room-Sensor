import 'dotenv/config';
import express from 'express';
import { router } from './routes.js';

const app = express();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api', router);

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
