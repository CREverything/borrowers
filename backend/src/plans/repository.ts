import type { Pool, PoolClient } from "pg";
import {
  assertCanAfford,
  getRequest,
  inTransaction,
  insertRequest,
  notifyAbout,
  prepare,
  RequestError,
  type BorrowRequest,
} from "../requests/repository.ts";
import type { PlanInput, PlanRequirement, Selection } from "./validation.ts";

/**
 * Saved event plans. Every query is scoped to the owner, so another user's
 * plan id simply isn't found. Borrow requests made from a plan go through
 * the same checks and inserts as any other request; nothing here moves
 * Switchies (that still happens when a lender approves).
 */

export interface PlanLink {
  requirementKey: string;
  itemId: number;
  requestId: string;
  /** Live from borrow_requests. */
  status: BorrowRequest["status"];
}

export interface EventPlanRecord {
  id: string;
  title: string;
  description: string;
  prompt: string;
  eventDate: string | null;
  startAt: string | null;
  returnAt: string | null;
  startDate: string | null;
  endDate: string | null;
  requirements: PlanRequirement[];
  links: PlanLink[];
  createdAt: string;
  updatedAt: string;
}

interface PlanRow {
  id: string;
  title: string;
  description: string;
  prompt: string;
  event_date: string | null;
  start_at: Date | null;
  return_at: Date | null;
  start_date: string | null;
  end_date: string | null;
  requirements: PlanRequirement[];
  links: PlanLink[];
  created_at: Date;
  updated_at: Date;
}

const SELECT_PLAN = `
  select p.id::text, p.title, p.description, p.prompt, p.event_date, p.start_at, p.return_at,
         p.start_date, p.end_date, p.requirements, p.created_at, p.updated_at,
         coalesce((
           select json_agg(json_build_object('requirementKey', l.requirement_key, 'itemId', l.item_id,
                                             'requestId', l.request_id::text, 'status', r.status)
                           order by l.created_at)
           from event_plan_requests l join borrow_requests r on r.id = l.request_id
           where l.plan_id = p.id
         ), '[]'::json) as links
  from event_plans p
`;

const toPlan = (row: PlanRow): EventPlanRecord => ({
  id: row.id,
  title: row.title,
  description: row.description,
  prompt: row.prompt,
  eventDate: row.event_date,
  startAt: row.start_at?.toISOString() ?? null,
  returnAt: row.return_at?.toISOString() ?? null,
  startDate: row.start_date,
  endDate: row.end_date,
  requirements: row.requirements,
  links: row.links,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const notFound = () => new RequestError(404, "Plan not found.");

export async function listPlans(pool: Pool, ownerId: string): Promise<EventPlanRecord[]> {
  const result = await pool.query<PlanRow>(
    `${SELECT_PLAN} where p.owner_id = $1 order by p.updated_at desc limit 100`,
    [ownerId],
  );
  return result.rows.map(toPlan);
}

export async function getPlan(db: Pool | PoolClient, ownerId: string, id: string): Promise<EventPlanRecord> {
  const result = await db.query<PlanRow>(`${SELECT_PLAN} where p.id = $1 and p.owner_id = $2`, [id, ownerId]);
  if (!result.rows[0]) throw notFound();
  return toPlan(result.rows[0]);
}

const COLUMNS: Record<Exclude<keyof PlanInput, "requirements">, string> = {
  title: "title",
  description: "description",
  prompt: "prompt",
  eventDate: "event_date",
  startAt: "start_at",
  returnAt: "return_at",
  startDate: "start_date",
  endDate: "end_date",
};

export async function createPlan(pool: Pool, ownerId: string, input: PlanInput): Promise<EventPlanRecord> {
  const result = await pool.query<{ id: string }>(
    `insert into event_plans (owner_id, title, description, prompt, event_date, start_at, return_at,
       start_date, end_date, requirements)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id::text`,
    [
      ownerId,
      input.title,
      input.description ?? "",
      input.prompt ?? "",
      input.eventDate ?? null,
      input.startAt ?? null,
      input.returnAt ?? null,
      input.startDate ?? null,
      input.endDate ?? null,
      JSON.stringify(input.requirements ?? []),
    ],
  );
  return getPlan(pool, ownerId, result.rows[0].id);
}

export async function updatePlan(pool: Pool, ownerId: string, id: string, input: PlanInput) {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    if (input[key] === undefined) continue;
    values.push(input[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if (input.requirements) {
    values.push(JSON.stringify(input.requirements));
    sets.push(`requirements = $${values.length}`);
  }
  values.push(id, ownerId);
  const result = await pool.query(
    `update event_plans set ${[...sets, "updated_at = now()"].join(", ")}
     where id = $${values.length - 1} and owner_id = $${values.length}`,
    values,
  );
  if (!result.rowCount) throw notFound();
  return getPlan(pool, ownerId, id);
}

/**
 * Deletes a plan. Requests already sent stay in My requests; a plan with
 * requests still pending or approved can't be deleted, so live requests
 * don't lose their event.
 */
export async function deletePlan(pool: Pool, ownerId: string, id: string) {
  await inTransaction(pool, async (client) => {
    const plan = await client.query("select 1 from event_plans where id = $1 and owner_id = $2 for update", [
      id,
      ownerId,
    ]);
    if (!plan.rowCount) throw notFound();
    const live = await client.query(
      `select 1 from event_plan_requests l join borrow_requests r on r.id = l.request_id
       where l.plan_id = $1 and r.status in ('pending', 'approved') limit 1`,
      [id],
    );
    if (live.rowCount) {
      throw new RequestError(409, "This plan has requests waiting or approved. Cancel them in My requests first.");
    }
    await client.query("delete from event_plans where id = $1", [id]);
  });
}

/** Copies a plan's details and checklist (not its requests) into a new draft. */
export async function duplicatePlan(pool: Pool, ownerId: string, id: string): Promise<EventPlanRecord> {
  const source = await getPlan(pool, ownerId, id);
  return createPlan(pool, ownerId, {
    title: `Copy of ${source.title}`.slice(0, 120),
    description: source.description,
    prompt: source.prompt,
    eventDate: source.eventDate,
    startAt: source.startAt,
    returnAt: source.returnAt,
    startDate: source.startDate,
    endDate: source.endDate,
    requirements: source.requirements,
  });
}

export interface SubmitResult {
  itemId: number;
  requirementKey: string;
  ok: boolean;
  /** True when this listing already had a live request from this plan. */
  alreadyRequested?: boolean;
  request?: BorrowRequest;
  error?: string;
}

/**
 * Sends a borrow request for each selected listing, using the same checks as
 * a single request (listing active and not yours, within its borrow limit,
 * dates free, no duplicate pending request, enough Switchies). Each listing
 * is its own transaction, so one failure doesn't block the rest, and the
 * plan row is locked so a double-click can't send the same listing twice.
 */
export async function submitPlanRequests(
  pool: Pool,
  ownerId: string,
  planId: string,
  selections: Selection[],
): Promise<{ results: SubmitResult[]; plan: EventPlanRecord }> {
  const plan = await getPlan(pool, ownerId, planId);
  if (!plan.startDate || !plan.endDate) {
    throw new RequestError(400, "Choose when you'll borrow and return everything first.");
  }
  const keys = new Set(plan.requirements.map((r) => r.key));
  const results: SubmitResult[] = [];

  for (const selection of selections) {
    const base = { itemId: selection.itemId, requirementKey: selection.requirementKey };
    if (!keys.has(selection.requirementKey)) {
      results.push({ ...base, ok: false, error: "That checklist item is no longer in the plan." });
      continue;
    }
    try {
      const outcome = await inTransaction(pool, (client) => requestOne(client, ownerId, planId, selection));
      results.push({
        ...base,
        ok: true,
        alreadyRequested: outcome.alreadyRequested || undefined,
        request: await getRequest(pool, outcome.requestId),
      });
    } catch (error) {
      if (!(error instanceof RequestError)) throw error;
      results.push({ ...base, ok: false, error: error.message });
    }
  }
  return { results, plan: await getPlan(pool, ownerId, planId) };
}

async function requestOne(client: PoolClient, ownerId: string, planId: string, selection: Selection) {
  // Serialises submissions for this plan, so a repeated click waits and then sees the first request.
  const locked = await client.query<{ title: string; start_date: string; end_date: string; return_at: Date | null }>(
    `select title, start_date, end_date, return_at from event_plans
     where id = $1 and owner_id = $2 for update`,
    [planId, ownerId],
  );
  const row = locked.rows[0];
  if (!row) throw notFound();

  const existing = await client.query<{ request_id: string }>(
    `select l.request_id::text from event_plan_requests l join borrow_requests r on r.id = l.request_id
     where l.plan_id = $1 and l.item_id = $2 and r.status in ('pending', 'approved')`,
    [planId, selection.itemId],
  );
  if (existing.rows[0]) return { alreadyRequested: true, requestId: existing.rows[0].request_id };

  // The same checks and insert as a normal borrow request.
  const prepared = await prepare(client, ownerId, selection.itemId, row.start_date, row.end_date);
  await assertCanAfford(client, ownerId, prepared.total);
  const requestId = await insertRequest(client, ownerId, prepared, row.start_date, row.end_date, null);
  if (row.return_at) {
    await client.query("update borrow_requests set requested_return_at = $2 where id = $1", [requestId, row.return_at]);
  }
  await client.query(
    "insert into event_plan_requests (plan_id, request_id, requirement_key, item_id) values ($1, $2, $3, $4)",
    [planId, requestId, selection.requirementKey, selection.itemId],
  );
  await client.query("update event_plans set updated_at = now() where id = $1", [planId]);
  await notifyAbout(client, await getRequest(client, requestId), "request_received", "lender", {
    eventTitle: row.title,
  });
  return { alreadyRequested: false, requestId };
}
