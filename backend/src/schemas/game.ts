import { z } from 'zod';

export const goalQualifierSchema = z.enum(['corner', 'header', 'deflection']);

export const goalSchema = z.object({
  scorerId: z.string(),
  assisterId: z.string().nullable(),
  timestamp: z.string(), // ISO date string
  // The team CREDITED with the goal. For an own goal that is the scorer's
  // opponent, which is what keeps the scoreline right with no special-casing.
  team: z.enum(['color', 'white']).nullable(),
  ownGoal: z.boolean().optional(),
  // This record ended the game under sudden death. Categorisation only — it is
  // what the golden-goal count and The Decider achievement read.
  goldenGoal: z.boolean().optional(),
  // Scoreline weight. Absent or 1 = a normal goal. The scorer's own total is
  // ALWAYS credited 1 regardless of this, or one freak comeback distorts a
  // season's leaderboards.
  value: z.number().int().min(1).optional(),
  // How the goal was scored. Purely descriptive — a qualified goal is worth
  // exactly the same as a plain one, and an empty or absent list just means
  // nobody said. A SET, not one choice: a header from a corner is the most
  // ordinary set-piece goal there is, and forcing a pick between the two would
  // record a falsehood either way.
  qualifiers: z.array(goalQualifierSchema).optional(),
});

// Why a player left. ABSENT IS NOT NEUTRAL: an untagged departure counts toward
// Lack of Stamina, and only an explicit excusing reason removes it. That
// asymmetry is deliberate — if the metric needed someone to volunteer 'quit'
// while the admin tagging them stood next to them, it would read zero forever.
// 'quit' therefore exists only to record that somebody actually asked; it
// scores identically to a blank.
export const leaveReasonSchema = z.enum(['injured', 'family', 'work', 'quit']);

export const teamChangeSchema = z.object({
  playerId: z.string(),
  timestamp: z.string(), // ISO date string
  team: z.enum(['color', 'white']),
  // 'join' = put on a team AFTER kick-off, i.e. a late arrival. Arriving on
  // time writes nothing at all — being in teamAssignments with no 'join' row IS
  // the on-time record, which is why the common case costs no storage.
  type: z.enum(['leave', 'swap', 'join']),
  previousTeam: z.enum(['color', 'white']).optional(),
  newTeam: z.enum(['color', 'white']).optional(),
  // Only meaningful on type 'leave'.
  reason: leaveReasonSchema.optional(),
});

export const gameEventSchema = z.object({
  // secondHalfStart marks play resuming after the break, so the clock can stop
  // during it. Accepted here before any client can send it: a rejected event
  // fails the whole game save, goals and stats included.
  type: z.enum(['halfTime', 'secondHalfStart', 'gameOver', 'goldenGoalArmed']),
  timestamp: z.string(), // ISO date string
  // Goal difference at the moment golden goal was armed, frozen there on
  // purpose: the deciding goal is worth n+1, and a value that moved silently
  // between arming and the goal is what causes an argument at full time.
  // Only present on goldenGoalArmed.
  n: z.number().int().min(0).optional(),
  // Which team was BEHIND at arming, frozen alongside n. Needed because the
  // decider is worth n+1 only to the trailing team; the leading team's goal is
  // worth 1. null = level, where n is 0 and either team wins by 1.
  trailing: z.enum(['color', 'white']).nullable().optional(),
});

// One guest appearance. slotPlayerId is the GuestN pool Player carrying the
// guest through teamAssignments/goals; guestName resolves server-side to a
// durable Guest identity. Both guestName and hostPlayerId are nullable —
// naming a guest and crediting a host are each skippable at the sideline.
export const guestVisitSchema = z.object({
  slotPlayerId: z.string(),
  guestName: z.string().trim().min(1).max(60).nullable(),
  hostPlayerId: z.string().nullable(),
});

export const updateGameSchema = z.object({
  guestVisits: z.array(guestVisitSchema).optional(),
  teamAssignments: z.record(z.enum(['color', 'white'])).optional(),
  goals: z.array(goalSchema).optional(),
  teamChanges: z.array(teamChangeSchema).optional(),
  gameEvents: z.array(gameEventSchema).optional(),
  sportsmanship: z.record(z.number()).optional(),
  fouls: z.record(z.number()).optional(),
  createdAt: z.string().datetime().optional(), // ISO date string
  gameNumber: z.number().int().positive().optional(), // Add game number support
  field: z.enum(['stadium', 'grass', 'cancelled']).nullable().optional(),
  // Kick-off. null clears it, so a mis-tap on the start button is undoable.
  startedAt: z.string().datetime().nullable().optional(),
});

export type Goal = z.infer<typeof goalSchema>;
export type GuestVisit = z.infer<typeof guestVisitSchema>;
export type UpdateGameInput = z.infer<typeof updateGameSchema>;

