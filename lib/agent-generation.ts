import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, insertJob, committedSpendSince, getSetting } from './db';
import { hasCredentials, estimate } from './providers';
import { parseGenerationRequest } from './payload';
import { ensureWorker } from './worker';
import { isMetered, HiggsfieldError } from './higgsfield';
import { AGENT_DIR, AgentError, getAgentPackage } from './agent-plans';

export function agentJobId(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new AgentError('Invalid plan ID.');
  const h = createHash('sha256').update('video-agent:' + id).digest('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function parseAgentGenerationOptions(value: unknown = {}) {
  const r = value as Record<string, unknown>;
  if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).some(k => !['authorized','maximumUsd','humanRequest'].includes(k)) ||
    (r.authorized !== undefined && typeof r.authorized !== 'boolean') ||
    (r.humanRequest !== undefined && (typeof r.humanRequest !== 'string' || !r.humanRequest.trim() || r.humanRequest.length > 12000)) ||
    (r.maximumUsd !== undefined && (typeof r.maximumUsd !== 'number' || !Number.isFinite(r.maximumUsd) || r.maximumUsd <= 0))) {
    throw new AgentError('Use an options object with an optional positive maximumUsd and optional humanRequest.');
  }
  // Legacy authorized fields are accepted for compatibility, without an approval gate.
  return { ...(r.maximumUsd === undefined ? {} : { maximumUsd: r.maximumUsd as number }),
    ...(r.humanRequest === undefined ? {} : { humanRequest: (r.humanRequest as string).trim() }) };
}
export async function generateAgentPlan(id: string, origin: string, options: ReturnType<typeof parseAgentGenerationOptions> = {}) {
  const jobId = agentJobId(id);
  const existing = () => db().prepare('SELECT id, est_usd, status FROM jobs WHERE id = ?').get(jobId) as { id: string; est_usd: number | null; status: string } | undefined;
  const previous = existing(); if (previous) return { id: jobId, estUsd: previous.est_usd, status: previous.status, replayed: true };
  const receipt = path.join(AGENT_DIR, `${id}.submission.json`);
  if (fs.existsSync(receipt)) throw new AgentError('This package was already reserved or its Library job was removed. Check its recorded job ID; do not submit a new paid request automatically.', 409);
  const pkg = getAgentPackage(id, origin);
  if (!pkg.generationRequest) throw new AgentError('Resolve the plan blockers before generating: ' + pkg.blockers.join(' '), 409);
  const { model, endpoint, body, prompt } = parseGenerationRequest(pkg.generationRequest);
  if (!hasCredentials(endpoint)) throw new AgentError('OpenRouter key is unavailable. Set it locally and restart the server.', 401);
  const quote = await estimate(endpoint, body);
  const usd = isMetered(quote) ? NaN : Number(quote.usd);
  if (!Number.isFinite(usd) || usd < 0 || (options.maximumUsd !== undefined && usd > options.maximumUsd)) throw new AgentError('The estimate exceeds maximumUsd or is unavailable. No generation started.', 402);
  const humanRequest = options.humanRequest ?? pkg.brief.request;
  fs.mkdirSync(AGENT_DIR, { recursive: true });
  try { fs.writeFileSync(receipt, JSON.stringify({ planId: id, jobId, maximumUsd: options.maximumUsd ?? null, estimatedUsd: usd, humanRequest, reservedAt: Date.now() }), { flag: 'wx' }); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new AgentError('Submission is already reserved. Check the package job before retrying.', 409); throw e; }
  let replayed = false;
  try { db().transaction(() => {
    if (existing()) { replayed = true; return; }
    const cap = Number(getSetting('spend_cap') ?? '');
    if (cap > 0 && committedSpendSince(Date.now() - 30 * 24 * 60 * 60 * 1000) + usd > cap) throw new AgentError('The configured spend cap blocks this request.', 402);
    // The ID is deterministic and unique in SQLite; concurrent submissions reserve exactly one job.
    insertJob({ id: jobId, model_id: model.id, model_name: `${model.name} · OpenRouter`, endpoint, kind: 'video', prompt,
      params: { ...body, _studio_agent_plan: id, _studio_agent_request: humanRequest }, batch: 1, est_usd: usd, est_credits: null });
  }).immediate(); } catch (e) {
    // No worker submission occurred. Clean only this invocation's reservation if the local transaction did not commit.
    if (!existing()) fs.unlinkSync(receipt);
    throw e;
  }
  ensureWorker(); return { id: jobId, estUsd: usd, replayed };
}
export function agentResponseError(e: unknown) {
  const known = e instanceof AgentError || e instanceof HiggsfieldError;
  return Response.json({ error: known ? e.message : 'The agent request could not be completed.' }, { status: known ? e.status : 500 });
}
