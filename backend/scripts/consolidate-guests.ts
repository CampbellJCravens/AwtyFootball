// Consolidate guest players into a fixed pool of 6.
//
//   npx ts-node scripts/consolidate-guests.ts          # preview only (no writes)
//   npx ts-node scripts/consolidate-guests.ts --apply  # actually mutate the DB
//
// What it does (apply mode):
//   1. Picks the top 6 guest player records by score = games + 2*goals + 2*assists
//      (tiebreaker: most-recently-seen). Renames them Guest1…Guest6.
//   2. For every game, walks all four JSON fields (teamAssignments, goals,
//      teamChanges, sportsmanship) and remaps every guest playerId based on
//      first-encountered order in that game: 1st → Guest1's id, 2nd → Guest2's
//      id, …, 6th → Guest6's id. Wraps if a single game had >6 guests.
//   3. Deletes the remaining (non-top-6) guest player records.
import prisma from '../src/prisma';

const APPLY = process.argv.includes('--apply');

const safeParse = <T>(v: string | null | undefined, fb: T): T => {
  if (!v) return fb;
  try { return (JSON.parse(v) ?? fb) as T; } catch { return fb; }
};

interface GoalRow { scorerId: string; assisterId: string | null; team: 'color' | 'white' | null; timestamp: string }
interface TeamChangeRow { playerId: string; timestamp: string; team: 'color' | 'white'; type: 'leave' | 'swap'; previousTeam?: 'color' | 'white'; newTeam?: 'color' | 'white' }

(async () => {
  console.log(`\n${APPLY ? '🔧 APPLY MODE — DB WILL BE MUTATED' : '🔍 PREVIEW MODE — no writes'}\n`);

  const players = await prisma.player.findMany();
  const guests = players.filter(p => /guest/i.test(p.name));
  const guestIdSet = new Set(guests.map(g => g.id));
  const guestById = new Map(guests.map(g => [g.id, g]));

  const games = await prisma.game.findMany({ orderBy: { createdAt: 'asc' } });

  // ── Pick the top 6 ──────────────────────────────────────────────
  const stats = new Map<string, { games: number; goals: number; assists: number; lastSeen: Date }>();
  for (const g of games) {
    const teams = safeParse<Record<string, 'color' | 'white'>>(g.teamAssignments, {});
    for (const pid of Object.keys(teams)) {
      if (!stats.has(pid)) stats.set(pid, { games: 0, goals: 0, assists: 0, lastSeen: g.createdAt });
      const s = stats.get(pid)!;
      s.games += 1;
      if (g.createdAt > s.lastSeen) s.lastSeen = g.createdAt;
    }
    for (const goal of safeParse<GoalRow[]>(g.goals, [])) {
      if (goal.scorerId) {
        if (!stats.has(goal.scorerId)) stats.set(goal.scorerId, { games: 0, goals: 0, assists: 0, lastSeen: g.createdAt });
        stats.get(goal.scorerId)!.goals += 1;
      }
      if (goal.assisterId) {
        if (!stats.has(goal.assisterId)) stats.set(goal.assisterId, { games: 0, goals: 0, assists: 0, lastSeen: g.createdAt });
        stats.get(goal.assisterId)!.assists += 1;
      }
    }
  }

  const scored = guests.map(p => {
    const s = stats.get(p.id) ?? { games: 0, goals: 0, assists: 0, lastSeen: new Date(0) };
    return { p, ...s, score: s.games + s.goals * 2 + s.assists * 2 };
  });
  scored.sort((a, b) => b.score - a.score || b.lastSeen.getTime() - a.lastSeen.getTime());

  const topSix = scored.slice(0, 6);
  const orphans = scored.slice(6);
  if (topSix.length < 6) {
    console.log(`⚠ Only ${topSix.length} guests in DB — fewer than 6 slots. Continuing with available count.`);
  }

  console.log('— TOP 6 SELECTION —');
  console.table(topSix.map((s, i) => ({
    new_name: `Guest${i + 1}`,
    current_name: s.p.name,
    id: s.p.id.slice(0, 8) + '…',
    games: s.games, goals: s.goals, assists: s.assists, score: s.score,
  })));

  // ── Build per-game remap by first-encountered order ─────────────
  const topSixIds = topSix.map(t => t.p.id);
  const newNameByTopId = new Map(topSixIds.map((id, i) => [id, `Guest${i + 1}`]));

  function getGuestOrderInGame(g: typeof games[number]): string[] {
    const order: string[] = [];
    const seen = new Set<string>();
    const push = (id: string | null | undefined) => {
      if (id && guestIdSet.has(id) && !seen.has(id)) { order.push(id); seen.add(id); }
    };

    // Pass 1: teamAssignments insertion order
    const teams = safeParse<Record<string, 'color' | 'white'>>(g.teamAssignments, {});
    for (const id of Object.keys(teams)) push(id);

    // Pass 2: goals chronologically
    const goals = safeParse<GoalRow[]>(g.goals, [])
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    for (const goal of goals) {
      push(goal.scorerId);
      push(goal.assisterId);
    }

    // Pass 3: teamChanges chronologically
    const teamChanges = safeParse<TeamChangeRow[]>(g.teamChanges, [])
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    for (const tc of teamChanges) push(tc.playerId);

    // Pass 4: sportsmanship insertion order (anything missed)
    const sports = safeParse<Record<string, number>>(g.sportsmanship, {});
    for (const id of Object.keys(sports)) push(id);

    return order;
  }

  // ── Preview the per-game remaps ─────────────────────────────────
  console.log('\n— PER-GAME REMAPS —');
  let gamesAffected = 0;
  let totalGuestRefs = 0;
  const slotUsage = new Array(topSixIds.length).fill(0);
  const overflowGames: Array<{ gameNumber: number | null; guestCount: number }> = [];

  // Cache the per-game order so we don't recompute in the apply pass.
  const orderByGameId = new Map<string, string[]>();

  for (const g of games) {
    const order = getGuestOrderInGame(g);
    orderByGameId.set(g.id, order);
    if (order.length === 0) continue;
    gamesAffected++;
    totalGuestRefs += order.length;
    if (order.length > topSixIds.length) {
      overflowGames.push({ gameNumber: g.gameNumber, guestCount: order.length });
    }

    const remapPairs = order.map((origId, i) => {
      const slot = i % topSixIds.length;
      slotUsage[slot]++;
      const targetId = topSixIds[slot];
      const origName = guestById.get(origId)?.name ?? origId;
      return `${origName}  →  Guest${slot + 1}`;
    });
    console.log(`  Game #${g.gameNumber ?? '?'}  (${order.length} guest${order.length === 1 ? '' : 's'})`);
    for (const line of remapPairs) console.log(`     ${line}`);
  }

  console.log('\n— SUMMARY —');
  console.log(`  Games with guest references: ${gamesAffected}`);
  console.log(`  Total guest references to remap: ${totalGuestRefs}`);
  console.log(`  Slot usage:`);
  topSixIds.forEach((_, i) => console.log(`     Guest${i + 1}: ${slotUsage[i]} refs`));
  if (overflowGames.length > 0) {
    console.log(`  ⚠ Games with >6 guests (will cycle): ${overflowGames.map(o => `#${o.gameNumber}(${o.guestCount})`).join(', ')}`);
  }
  console.log(`  Top 6 player records: rename in place`);
  console.log(`  Player records to DELETE: ${orphans.length}`);

  if (!APPLY) {
    console.log('\nNo writes performed. Re-run with --apply to commit.');
    await prisma.$disconnect();
    return;
  }

  // ── APPLY ───────────────────────────────────────────────────────
  console.log('\n--apply received. Writing to DB…');

  // 1. Rewrite each game's JSON fields
  let gamesWritten = 0;
  for (const g of games) {
    const order = orderByGameId.get(g.id) ?? [];
    if (order.length === 0) continue;
    // origId → newId map for this specific game
    const remap = new Map<string, string>(order.map((origId, i) => [origId, topSixIds[i % topSixIds.length]]));
    const remapId = (id: string) => remap.get(id) ?? id;

    const oldTeams = safeParse<Record<string, 'color' | 'white'>>(g.teamAssignments, {});
    const newTeams: Record<string, 'color' | 'white'> = {};
    for (const [oldId, team] of Object.entries(oldTeams)) {
      newTeams[remapId(oldId)] = team;
    }

    const oldGoals = safeParse<GoalRow[]>(g.goals, []);
    const newGoals = oldGoals.map(goal => ({
      ...goal,
      scorerId: remapId(goal.scorerId),
      assisterId: goal.assisterId ? remapId(goal.assisterId) : null,
    }));

    const oldTeamChanges = safeParse<TeamChangeRow[]>(g.teamChanges, []);
    const newTeamChanges = oldTeamChanges.map(tc => ({ ...tc, playerId: remapId(tc.playerId) }));

    const oldSports = safeParse<Record<string, number>>(g.sportsmanship, {});
    const newSports: Record<string, number> = {};
    for (const [oldId, val] of Object.entries(oldSports)) {
      const k = remapId(oldId);
      // If two orig ids collapse to the same new id, sum the sportsmanship.
      newSports[k] = (newSports[k] ?? 0) + val;
    }

    await prisma.game.update({
      where: { id: g.id },
      data: {
        teamAssignments: JSON.stringify(newTeams),
        goals: JSON.stringify(newGoals),
        teamChanges: JSON.stringify(newTeamChanges),
        sportsmanship: JSON.stringify(newSports),
      },
    });
    gamesWritten++;
  }
  console.log(`  Rewrote ${gamesWritten} game records.`);

  // 2. Rename top 6
  for (const [id, newName] of newNameByTopId) {
    await prisma.player.update({ where: { id }, data: { name: newName } });
  }
  console.log(`  Renamed ${newNameByTopId.size} top-6 players.`);

  // 3. Delete orphans
  const orphanIds = orphans.map(o => o.p.id);
  if (orphanIds.length > 0) {
    const result = await prisma.player.deleteMany({ where: { id: { in: orphanIds } } });
    console.log(`  Deleted ${result.count} orphan guest players.`);
  }

  console.log('\n✅ Done.');
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
