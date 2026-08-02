import prisma from '../src/prisma';
import { computeReliability, isGuestPool, RsvpBucket } from '../src/services/reliability';
import { shrunkProbability } from '../src/services/turnout';

const parse = <T,>(v: string|null, f: T): T => { try { return v ? (JSON.parse(v) ?? f) : f; } catch { return f; } };

(async () => {
  const [rel, games, players, rsvps] = await Promise.all([
    computeReliability(),
    prisma.game.findMany({ select: { id: true, createdAt: true, gameNumber: true, teamAssignments: true }, orderBy: { createdAt: 'asc' } }),
    prisma.player.findMany({ select: { id: true, name: true } }),
    prisma.gameRsvp.findMany({ select: { gameId: true, playerId: true, status: true, guestCount: true } }),
  ]);
  const base = rel.summary.baseRates;
  const hist = new Map(rel.players.map(p => [p.id, p]));
  const nameById = new Map(players.map(p => [p.id, p.name]));
  const nonGuest = players.filter(p => !isGuestPool(p.name));
  const unflagged = Math.max(0, (rel.summary.guestsShown - rel.summary.guestsIndicated) / rel.totalTrackedGames);

  const rsvpByGame = new Map<string, Map<string,{status:string;guestCount:number}>>();
  for (const r of rsvps) {
    if (!rsvpByGame.has(r.gameId)) rsvpByGame.set(r.gameId, new Map());
    rsvpByGame.get(r.gameId)!.set(r.playerId, { status: r.status, guestCount: r.guestCount });
  }
  const toBucket = (s?: string): RsvpBucket => s==='yes'?'yes':s==='maybe'?'maybe':s==='no'?'no':'silent';

  let n=0, sumAbs=0, sumErr=0, inRange=0, rsvpGames=0, sumAbsNaive=0;
  const rows: string[] = [];
  for (const g of games) {
    const roster = Object.keys(parse<Record<string,string>>(g.teamAssignments, {}));
    if (roster.length === 0) continue;
    const gr = rsvpByGame.get(g.id) ?? new Map();
    if (gr.size === 0) continue;   // no poll data -> nothing to predict from
    rsvpGames++;

    const ps = nonGuest.map(p => shrunkProbability(hist.get(p.id), toBucket(gr.get(p.id)?.status), base).p);
    const exp = ps.reduce((a,b)=>a+b,0);
    const sd = Math.sqrt(ps.reduce((a,p)=>a+p*(1-p),0));
    const gi = [...gr.values()].reduce((a,r)=>a+(r.status==='yes'?r.guestCount:0),0);
    const pred = exp + gi + unflagged;
    const actual = roster.length;                     // total bodies incl guests
    const naive = [...gr.values()].filter(r=>r.status==='yes').length + gi;  // "count the In votes"

    n++; sumAbs += Math.abs(pred-actual); sumErr += pred-actual;
    sumAbsNaive += Math.abs(naive-actual);
    const lo = Math.max(0,exp-sd)+gi+unflagged, hi = exp+sd+gi+unflagged;
    if (actual >= Math.round(lo) && actual <= Math.round(hi)) inRange++;
    rows.push(`  ${g.createdAt.toISOString().slice(0,10)}  pred ${pred.toFixed(1).padStart(5)} [${Math.round(lo)}-${Math.round(hi)}]   actual ${String(actual).padStart(3)}   err ${(pred-actual>=0?'+':'')}${(pred-actual).toFixed(1).padStart(5)}   naive-In ${String(naive).padStart(3)}`);
  }
  console.log(`games with RSVP data: ${rsvpGames} of ${rel.totalTrackedGames} tracked\n`);
  console.log(rows.join('\n'));
  console.log(`\nMODEL  MAE ${(sumAbs/n).toFixed(2)}   mean bias ${(sumErr/n>=0?'+':'')}${(sumErr/n).toFixed(2)}   within ±1sd: ${inRange}/${n} (${(inRange/n*100).toFixed(0)}%, ~68% expected)`);
  console.log(`NAIVE  MAE ${(sumAbsNaive/n).toFixed(2)}   (just counting In votes + flagged guests)`);
  console.log(`\n>>> model is ${((1 - (sumAbs/n)/(sumAbsNaive/n))*100).toFixed(0)}% more accurate than counting In votes`);
  console.log('\nCAVEAT: base rates are fit on all games including the one predicted (in-sample).');
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
