import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Copy,
  FolderOpen,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useAuthState } from "../auth/AuthContext";
import { clearPendingIntent, peekPendingIntent } from "../auth/pendingAction";
import Dialog from "../components/Dialog";
import { EVENT_PLACEHOLDER } from "../components/EventPlannerBanner";
import LoginRequired from "../components/LoginRequired";
import { useRequireAuth } from "../components/LoginPrompt";
import PlanWorkspace from "../components/planner/PlanWorkspace";
import { formatShortDate, isoToLocalInput } from "../lib/dates";
import { coverageOf, requirementKey, type PlanDraft } from "../lib/planning";
import { navigate, paths } from "../router";
import { eventPlanner } from "../services/eventPlanner";
import {
  deletePlan,
  duplicatePlan,
  getPlan,
  listPlans,
  type PlanError,
  type SavedPlan,
} from "../services/plansApi";
import type { EventPlan } from "../types";

const EXAMPLES = [
  "I'm organizing an outdoor movie night for 20 students",
  "Study group for our chem final, 6 of us",
  "Birthday party for 30 friends this Saturday",
];

/** A fresh workspace from the AI's checklist. Dates are left for the organiser to choose. */
function planToDraft(plan: EventPlan, prompt: string): PlanDraft {
  const taken = new Set<string>();
  return {
    title: plan.title,
    description: plan.description || plan.summary,
    prompt,
    eventDate: plan.eventDate ?? "",
    startDate: "",
    startTime: "",
    endDate: "",
    returnTime: "",
    requirements: plan.requirements.map((r) => {
      const key = requirementKey(r.name, taken);
      taken.add(key);
      return {
        key,
        name: r.name,
        quantity: r.quantity,
        importance: r.importance ?? "essential",
        reason: r.reason,
        keywords: r.keywords,
        selected: [],
      };
    }),
  };
}

function savedToDraft(plan: SavedPlan): PlanDraft {
  return {
    title: plan.title,
    description: plan.description,
    prompt: plan.prompt,
    eventDate: plan.eventDate ?? "",
    startDate: plan.startAt ? isoToLocalInput(plan.startAt).slice(0, 10) : (plan.startDate ?? ""),
    startTime: plan.startAt ? isoToLocalInput(plan.startAt).slice(11, 16) : "",
    endDate: plan.returnAt ? isoToLocalInput(plan.returnAt).slice(0, 10) : (plan.endDate ?? ""),
    returnTime: plan.returnAt ? isoToLocalInput(plan.returnAt).slice(11, 16) : "",
    requirements: plan.requirements,
  };
}

export default function EventPlannerPage({
  query,
  planId,
  mine,
}: {
  query: string;
  planId: string | null;
  mine: boolean;
}) {
  const showingMine = mine && !planId;
  return (
    <div className="container page">
      <a className="back-link" href={paths.browse}>
        <ArrowLeft size={18} aria-hidden="true" />
        Back to marketplace
      </a>

      <header className="page__head">
        <h1>Plan an event</h1>
        <p className="page__lead">
          Describe what you're planning and we'll find what you need from students nearby.
        </p>
      </header>

      <nav className="tabs" aria-label="Planner">
        <a className={`chip${!showingMine ? " chip--active" : ""}`} href={paths.plan()} aria-current={!showingMine ? "page" : undefined}>
          <Sparkles size={16} aria-hidden="true" />
          {planId ? "Plan" : "New plan"}
        </a>
        <a className={`chip${showingMine ? " chip--active" : ""}`} href={paths.myPlans} aria-current={showingMine ? "page" : undefined}>
          <FolderOpen size={16} aria-hidden="true" />
          My plans
        </a>
      </nav>

      {showingMine ? <MyPlans /> : planId ? <SavedPlanView key={planId} id={planId} /> : <NewPlan query={query} />}
    </div>
  );
}

/** Lets a guest explore, and asks them to log in (keeping everything) to save or send. */
function useSignInGate(query: string) {
  const requireAuth = useRequireAuth();
  return useCallback(
    (draft: PlanDraft) => ({
      allowed: requireAuth("event-request", {
        restore: { intent: { kind: "event", query, draft }, label: `your plan for ${draft.title}` },
      }),
    }),
    [requireAuth, query],
  );
}

function NewPlan({ query }: { query: string }) {
  const [description, setDescription] = useState(query);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [restored, setRestored] = useState(false);
  const latestRun = useRef(0);
  const gate = useSignInGate(query);

  // The URL holds the description, so plans survive refreshes and back navigation.
  useEffect(() => {
    setDescription(query);
    setFailed(false);
    if (!query.trim()) {
      setDraft(null);
      return;
    }
    const run = ++latestRun.current;
    // Back from logging in: bring back exactly what they had, without asking the AI again.
    const saved = peekPendingIntent("event", (intent) => intent.query === query);
    if (saved) {
      clearPendingIntent();
      setDraft(saved.draft);
      setRestored(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    eventPlanner
      .plan(query)
      .then((plan) => {
        if (run !== latestRun.current) return;
        setDraft(planToDraft(plan, query));
        setLoading(false);
      })
      .catch(() => {
        if (run !== latestRun.current) return;
        setDraft(null);
        setFailed(true);
        setLoading(false);
      });
  }, [query]);

  const submit = (text: string) => {
    const trimmed = text.trim();
    // Same text as the current plan: nothing new to ask, so repeat clicks do nothing.
    if (!trimmed || loading || trimmed === query) return;
    navigate(paths.plan(trimmed));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(description);
  };

  return (
    <>
      <form className="planner-form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="planner-input">
          Describe your event
        </label>
        <input
          id="planner-input"
          type="text"
          maxLength={500}
          placeholder={EVENT_PLACEHOLDER}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={loading || !description.trim()}>
          <Sparkles size={18} aria-hidden="true" />
          {loading ? "Planning..." : "Plan with AI"}
        </button>
      </form>

      {loading && <PlanSkeleton />}

      {failed && !loading && (
        <div className="notice" role="alert">
          <p>
            <strong>We couldn't put a plan together just now.</strong> Try again in a moment, or describe the event a
            little differently.
          </p>
        </div>
      )}

      {!loading && !draft && (
        <div className="examples">
          <p className="muted">Try one of these:</p>
          <div className="examples__list">
            {EXAMPLES.map((example) => (
              <button key={example} className="chip" onClick={() => submit(example)}>
                {example}
              </button>
            ))}
          </div>
        </div>
      )}

      {!loading && draft && (
        <>
          {restored && (
            <p className="resume-note" role="status">
              Welcome back. Your plan, dates and selected listings are just as you left them.
            </p>
          )}
          <PlanWorkspace
            key={query}
            initial={draft}
            saved={null}
            onSignInNeeded={gate}
            // Point the address bar at the saved plan without leaving the page, so
            // anything in progress (like sending requests) isn't interrupted.
            onSaved={(plan) => window.history.replaceState(null, "", paths.savedPlan(plan.id))}
          />
        </>
      )}
    </>
  );
}

function PlanSkeleton() {
  return (
    <div className="planner-loading-block" role="status" aria-live="polite">
      <p className="planner-loading">
        <Sparkles size={22} className="pulse" aria-hidden="true" />
        Working out what you'll need...
      </p>
      <div className="skeleton skeleton--title" />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

function SavedPlanView({ id }: { id: string }) {
  const { status, getToken } = useAuthState();
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [error, setError] = useState<{ message: string; status: number } | null>(null);
  const gate = useSignInGate("");

  useEffect(() => {
    if (status !== "signed-in") return;
    let active = true;
    getPlan(getToken, id)
      .then((p) => active && setPlan(p))
      .catch((e: PlanError) => active && setError({ message: e.message, status: e.status }));
    return () => {
      active = false;
    };
    // Not keyed on getToken: its identity changes whenever Clerk refreshes.
  }, [id, status]);

  if (status === "loading") return <p className="muted">Checking your account...</p>;
  if (status !== "signed-in") {
    return (
      <LoginRequired
        title="Log in to open your plan."
        message="Saved plans belong to your account."
        returnTo={paths.savedPlan(id).slice(1)}
      />
    );
  }
  if (error) {
    return (
      <div className="empty">
        <span className="empty__icon">
          <ClipboardList size={28} aria-hidden="true" />
        </span>
        <h3>{error.status === 404 ? "We couldn't find that plan" : "This plan couldn't be loaded"}</h3>
        <p>{error.status === 404 ? "It may have been deleted, or it belongs to someone else." : error.message}</p>
        <a className="btn btn--secondary" href={paths.myPlans}>
          My plans
        </a>
      </div>
    );
  }
  if (!plan) return <PlanSkeleton />;
  return <PlanWorkspace initial={savedToDraft(plan)} saved={plan} onSignInNeeded={gate} onSaved={() => {}} />;
}

function MyPlans() {
  const { status, getToken } = useAuthState();
  const [plans, setPlans] = useState<SavedPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<SavedPlan | null>(null);

  const load = useCallback(() => {
    setError(null);
    listPlans(getToken)
      .then(setPlans)
      .catch((e: PlanError) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "signed-in") load();
  }, [status, load]);

  if (status === "loading") return <p className="muted">Checking your account...</p>;
  if (status !== "signed-in") {
    return (
      <LoginRequired
        title="Log in to see your saved plans."
        message="You can plan without an account; saving and sending requests need one."
        returnTo={paths.myPlans.slice(1)}
      />
    );
  }
  if (error) {
    return (
      <div className="empty" role="alert">
        <h3>Your plans couldn't be loaded</h3>
        <p>{error}</p>
        <button className="btn btn--secondary" onClick={load}>
          Try again
        </button>
      </div>
    );
  }
  if (!plans) return <PlanSkeleton />;
  if (plans.length === 0) {
    return (
      <div className="empty">
        <span className="empty__icon">
          <ClipboardList size={28} aria-hidden="true" />
        </span>
        <h3>No saved plans yet</h3>
        <p>Describe an event, select what you need, and save it as a draft to come back to.</p>
        <a className="btn btn--primary" href={paths.plan()}>
          Plan an event
        </a>
      </div>
    );
  }

  const duplicate = async (plan: SavedPlan) => {
    setBusy(plan.id);
    try {
      const copy = await duplicatePlan(getToken, plan.id);
      navigate(paths.savedPlan(copy.id));
    } catch (e) {
      setError((e as PlanError).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <ul className="plan-cards">
        {plans.map((plan) => {
          const essential = plan.requirements.filter((r) => r.importance === "essential");
          const confirmed = essential.filter(
            (r) => coverageOf(r, plan.links, () => true).state === "confirmed",
          ).length;
          const pending = plan.links.filter((l) => l.status === "pending").length;
          const declined = plan.links.filter((l) => l.status === "declined").length;
          return (
            <li key={plan.id} className="plan-card">
              <a className="plan-card__main" href={paths.savedPlan(plan.id)}>
                <h3>{plan.title}</h3>
                <p className="muted small">
                  <CalendarDays size={14} aria-hidden="true" />{" "}
                  {plan.eventDate ? formatShortDate(plan.eventDate) : "No date yet"} · {plan.requirements.length}{" "}
                  {plan.requirements.length === 1 ? "item" : "items"}
                  {pending > 0 && ` · ${pending} pending`}
                  {declined > 0 && ` · ${declined} declined`}
                </p>
                <span className="readiness__bar" aria-hidden="true">
                  <span style={{ width: `${essential.length ? (confirmed / essential.length) * 100 : 0}%` }} />
                </span>
                <span className="small">
                  {confirmed} of {essential.length} essential confirmed
                </span>
              </a>
              <div className="plan-card__actions">
                <button
                  className="btn btn--ghost btn--sm"
                  disabled={busy === plan.id}
                  onClick={() => void duplicate(plan)}
                >
                  <Copy size={14} aria-hidden="true" /> Duplicate
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => setConfirming(plan)}>
                  <Trash2 size={14} aria-hidden="true" /> Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {confirming && (
        <DeletePlanDialog
          plan={confirming}
          onClose={() => setConfirming(null)}
          onDelete={async () => {
            await deletePlan(getToken, confirming.id);
            setPlans((list) => list?.filter((p) => p.id !== confirming.id) ?? null);
          }}
        />
      )}
    </>
  );
}

function DeletePlanDialog({
  plan,
  onClose,
  onDelete,
}: {
  plan: SavedPlan;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  return (
    <Dialog title={`Delete "${plan.title}"?`} icon={<Trash2 size={24} />} onClose={onClose}>
      <div className="dialog-form">
        <p className="muted">
          The plan and its checklist are deleted. Requests you've already sent aren't affected; they stay in My
          requests.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Keep it
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              setError(null);
              try {
                await onDelete();
                onClose();
              } catch (e) {
                setError((e as PlanError).message);
                setDeleting(false);
              }
            }}
          >
            {deleting ? "Deleting..." : "Delete plan"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
