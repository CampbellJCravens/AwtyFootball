import { PrismaClient } from '@prisma/client';

// Neon suspends its compute after ~5 idle minutes and takes ~4-6s to resume —
// straddling Prisma's 5s default connect timeout. So the first query after any
// quiet period intermittently throws "Can't reach database server", and the
// WhatsApp listener swallows that in its catch and loses the poll for good.
// Waiting out the resume is free: Neon bills awake time, not the wait.
const url = process.env.DATABASE_URL;
const wakeUrl =
  url && !/[?&]connect_timeout=/.test(url)
    ? url + (url.includes('?') ? '&' : '?') + 'connect_timeout=20'
    : url;

const prisma = wakeUrl
  ? new PrismaClient({ datasources: { db: { url: wakeUrl } } })
  : new PrismaClient();

export default prisma;
