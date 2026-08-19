import { Router, Response } from 'express';
import { requireAdmin, AuthenticatedRequest } from '../middleware/auth';
import prisma from '../prisma';
import {
  addDuesEntry,
  computeDuesYearReport,
  currentDuesYear,
  markManyLeft,
  markPlayerLeft,
  openDuesYear,
  recordPayment,
  DuesYearNotConfiguredError,
} from '../services/dues';

const router = Router();

const parseYear = (raw: unknown, fallback: number): number | null => {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
};

const fail = (res: Response, error: unknown, message: string) => {
  if (error instanceof DuesYearNotConfiguredError) {
    return res.status(409).json({ error: error.message, duesYear: error.duesYear });
  }
  console.error(message, error);
  return res.status(500).json({ error: message });
};

// GET /api/dues?year=2027 - the whole page: roster, balances, guests, totals.
router.get('/', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const year = parseYear(req.query.year, currentDuesYear());
  if (year === null) return res.status(400).json({ error: 'Invalid year.' });
  try {
    res.json(await computeDuesYearReport(year));
  } catch (error) {
    fail(res, error, 'Failed to compute dues report');
  }
});

// GET /api/dues/years - which years exist, for the year picker.
router.get('/years', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await prisma.duesYearConfig.findMany({ orderBy: { duesYear: 'desc' } });
    res.json(rows.map(r => ({
      duesYear: r.duesYear,
      memberAmount: r.memberAmount.toFixed(2),
      targetAmount: r.targetAmount.toFixed(2),
      guestGameRate: r.guestGameRate.toFixed(2),
      openedAt: r.openedAt?.toISOString() ?? null,
    })));
  } catch (error) {
    fail(res, error, 'Failed to list dues years');
  }
});

// PUT /api/dues/:year/config - set the rates. memberAmount is entered, never
// computed from the target, and is meant to be fixed once at season open.
router.put('/:year/config', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const year = parseYear(req.params.year, NaN);
  if (year === null || Number.isNaN(year)) return res.status(400).json({ error: 'Invalid year.' });

  const { targetAmount, memberAmount, guestGameRate } = req.body ?? {};
  const nums = { targetAmount, memberAmount, guestGameRate };
  for (const [key, value] of Object.entries(nums)) {
    if (value === undefined || Number.isNaN(Number(value)) || Number(value) < 0) {
      return res.status(400).json({ error: `${key} must be a non-negative number.` });
    }
  }

  try {
    const row = await prisma.duesYearConfig.upsert({
      where: { duesYear: year },
      create: { duesYear: year, targetAmount, memberAmount, guestGameRate },
      update: { targetAmount, memberAmount, guestGameRate },
    });
    res.json({
      duesYear: row.duesYear,
      targetAmount: row.targetAmount.toFixed(2),
      memberAmount: row.memberAmount.toFixed(2),
      guestGameRate: row.guestGameRate.toFixed(2),
      openedAt: row.openedAt?.toISOString() ?? null,
    });
  } catch (error) {
    fail(res, error, 'Failed to save dues config');
  }
});

// POST /api/dues/:year/open - snapshot the roster into the year. Idempotent.
router.post('/:year/open', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const year = parseYear(req.params.year, NaN);
  if (year === null || Number.isNaN(year)) return res.status(400).json({ error: 'Invalid year.' });
  try {
    res.json(await openDuesYear(year));
  } catch (error) {
    fail(res, error, 'Failed to open dues year');
  }
});

// POST /api/dues/:year/entry - put one person on the bill, or bring back
// someone who left. The only other way in is the bulk roster sync, which bills
// everyone at full price; this is the door for mid-year joiners and returning
// members, and it is what writes joinedAt.
router.post('/:year/entry', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const year = parseYear(req.params.year, NaN);
  if (year === null || Number.isNaN(year)) return res.status(400).json({ error: 'Invalid year.' });

  const { playerId, amountOwed, joinedAt, note } = req.body ?? {};
  if (typeof playerId !== 'string' || !playerId) {
    return res.status(400).json({ error: 'playerId is required.' });
  }
  let joined: Date | null = null;
  if (joinedAt !== undefined && joinedAt !== null) {
    joined = new Date(joinedAt);
    if (Number.isNaN(joined.getTime())) return res.status(400).json({ error: 'Invalid joinedAt.' });
  }

  try {
    const row = await addDuesEntry({ duesYear: year, playerId, amountOwed, joinedAt: joined, note });
    res.status(201).json({ ...row, amountOwed: row.amountOwed.toFixed(2) });
  } catch (error) {
    if (error instanceof DuesYearNotConfiguredError) {
      return res.status(409).json({ error: error.message, duesYear: error.duesYear });
    }
    if (error instanceof Error && !(error as { code?: string }).code) {
      return res.status(400).json({ error: error.message });
    }
    fail(res, error, 'Failed to add dues entry');
  }
});

// POST /api/dues/entry/:id/left - they left, and the dues are kept. Sets what
// they owed to what they paid, so the row reads settled instead of carrying a
// balance nobody will collect. Reversed by POST /:year/entry.
router.post('/entry/:id/left', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = await markPlayerLeft(req.params.id);
    res.json({ ...row, amountOwed: row.amountOwed.toFixed(2) });
  } catch (error) {
    if (error instanceof Error && !(error as { code?: string }).code) {
      return res.status(400).json({ error: error.message });
    }
    fail(res, error, 'Failed to mark as left');
  }
});

// POST /api/dues/:year/sweep - close out a collection by marking the people who
// never paid as having left, in one pass. Rows already marked, or belonging to
// another year, are skipped rather than failing the batch.
router.post('/:year/sweep', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const year = parseYear(req.params.year, NaN);
  if (year === null || Number.isNaN(year)) return res.status(400).json({ error: 'Invalid year.' });

  const { entryIds } = req.body ?? {};
  if (!Array.isArray(entryIds) || entryIds.some(id => typeof id !== 'string')) {
    return res.status(400).json({ error: 'entryIds must be an array of entry ids.' });
  }
  if (entryIds.length === 0) return res.status(400).json({ error: 'Nobody selected.' });

  try {
    res.json(await markManyLeft(year, entryIds));
  } catch (error) {
    if (error instanceof Error && !(error as { code?: string }).code) {
      return res.status(400).json({ error: error.message });
    }
    fail(res, error, 'Failed to close out the year');
  }
});

// PATCH /api/dues/entry/:id - adjust what one person owes, or leave a note.
// This is where alumni exemptions, mid-year pro-rata and future discounts land.
router.patch('/entry/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { amountOwed, exemption, note, joinedAt } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (amountOwed !== undefined) {
    if (Number.isNaN(Number(amountOwed)) || Number(amountOwed) < 0) {
      return res.status(400).json({ error: 'amountOwed must be a non-negative number.' });
    }
    data.amountOwed = amountOwed;
  }
  if (exemption !== undefined) data.exemption = exemption || null;
  if (note !== undefined) data.note = note || null;
  // Correcting a join date after the fact - added in June, actually started in
  // March - without having to delete and re-add the row.
  if (joinedAt !== undefined) {
    if (joinedAt === null) data.joinedAt = null;
    else {
      const when = new Date(joinedAt);
      if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid joinedAt.' });
      data.joinedAt = when;
    }
  }
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  try {
    const row = await prisma.duesRosterEntry.update({ where: { id: req.params.id }, data });
    res.json({ ...row, amountOwed: row.amountOwed.toFixed(2) });
  } catch (error) {
    fail(res, error, 'Failed to update dues entry');
  }
});

// POST /api/dues/payments - record one payment. Recording a second against the
// same person and year is this same call, not a special case.
router.post('/payments', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { duesYear, playerId, guestId, amount, method, paidAt, note } = req.body ?? {};
  const year = parseYear(duesYear, NaN);
  if (year === null || Number.isNaN(year)) return res.status(400).json({ error: 'Invalid duesYear.' });

  const when = paidAt ? new Date(paidAt) : new Date();
  if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid paidAt.' });

  try {
    const row = await recordPayment({
      duesYear: year, playerId, guestId, amount, method, paidAt: when, note,
      recordedBy: req.user?.id ?? null,
    });
    res.status(201).json({ ...row, amount: row.amount.toFixed(2) });
  } catch (error) {
    if (error instanceof DuesYearNotConfiguredError) {
      return res.status(409).json({ error: error.message, duesYear: error.duesYear });
    }
    if (error instanceof Error && !(error as { code?: string }).code) {
      return res.status(400).json({ error: error.message });
    }
    fail(res, error, 'Failed to record payment');
  }
});

// PATCH /api/dues/payments/:id - correct a payment. Edits are visible via
// updatedAt rather than silently replacing what was there.
router.patch('/payments/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { amount, method, paidAt, note } = req.body ?? {};
  const data: Record<string, unknown> = {};
  if (amount !== undefined) {
    if (Number.isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'amount must be greater than zero.' });
    }
    data.amount = amount;
  }
  if (method !== undefined) data.method = method;
  if (paidAt !== undefined) {
    const when = new Date(paidAt);
    if (Number.isNaN(when.getTime())) return res.status(400).json({ error: 'Invalid paidAt.' });
    data.paidAt = when;
  }
  if (note !== undefined) data.note = note || null;
  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

  try {
    const row = await prisma.duesPayment.update({ where: { id: req.params.id }, data });
    res.json({ ...row, amount: row.amount.toFixed(2) });
  } catch (error) {
    fail(res, error, 'Failed to update payment');
  }
});

// DELETE /api/dues/payments/:id - for a payment recorded in error.
router.delete('/payments/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.duesPayment.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    fail(res, error, 'Failed to delete payment');
  }
});

export default router;
