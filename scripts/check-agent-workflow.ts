// Real local HTTP canary only. Never creates an upstream generation or publishes media.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, insertJob, updateJob, deleteJob } from '../lib/db';
import { agentJobId } from '../lib/agent-generation';
import { AGENT_DIR } from '../lib/agent-plans';
import type { AgentPackage } from '../lib/agent-contract';

const base = process.env.VIDEO_AGENT_BASE_URL || 'http://127.0.0.1:3000';
async function main() {
const fixture = JSON.parse(fs.readFileSync('docs/agent-brief.example.json', 'utf8'));
fixture.request = 'Unbillable HTTP technical canary ' + randomUUID();
fixture.location = { name: 'Invented test world', viewpoint: 'Eye level', minimumReferences: 0 };
fixture.audio = { mode: 'silent' }; fixture.dialogue.text = '';
fixture.scenes[0].duration = 5.25;
fixture.scenes[0].action = 'A technical test object moves slowly across an invented scene. No visible speech.';
const countBefore = (db().prepare('SELECT COUNT(*) AS count FROM jobs').get() as { count: number }).count;
let pkg: AgentPackage | undefined, inserted: string | undefined;
async function post(url: string, value: unknown, extra: Record<string,string> = {}) {
  return fetch(base + url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', 'X-Video-Agent': 'studio-v1', ...extra }, body: JSON.stringify(value) });
}
try {
  const cap = await fetch(base + '/api/agent/capabilities'); assert.equal(cap.status, 200);
  const response = await post('/api/agent/plans', fixture); assert.equal(response.status, 200);
  pkg = await response.json() as AgentPackage; assert.equal(pkg.status, 'ready'); assert.equal(pkg.generationStarted, false);
  assert.ok(pkg.compositionUrl.startsWith(base + '/ads?agentPlan='));
  const repeat = await (await post('/api/agent/plans', fixture)).json(); assert.equal(repeat.id, pkg.id);
  assert.equal((await fetch(base + '/api/agent/plans/' + pkg.id)).status, 200);
  assert.equal((await fetch(pkg.compositionUrl)).status, 200);
  assert.equal((await post('/api/agent/plans', fixture, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await post('/api/agent/plans/' + pkg.id + '/generate', { maximumUsd: 0 })).status, 400);
  assert.equal((db().prepare('SELECT COUNT(*) AS count FROM jobs').get() as { count: number }).count, countBefore);
  // Terminal local fixture proves retries return an existing job without touching credentials/estimate/worker.
  const jobId = agentJobId(pkg.id); assert.equal(db().prepare('SELECT id FROM jobs WHERE id=?').get(jobId), undefined);
  insertJob({ id: jobId, model_id: 'agent-technical-fixture', model_name: 'Technical canary', endpoint: 'local/test', kind: 'video', prompt: 'No provider request', params: {}, batch: 1, est_usd: 0, est_credits: null });
  inserted = jobId; updateJob(jobId, { status: 'failed', error: 'Technical fixture, no generation.' });
  const options = {};
  for (const value of [options, { authorized: false }]) { const r = await post(`/api/agent/plans/${pkg.id}/generate`, value); assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.id, jobId); assert.equal(j.replayed, true); assert.equal(j.status, 'failed'); }
  const empty = await fetch(`${base}/api/agent/plans/${pkg.id}/generate`, { method: 'POST', headers: { 'X-Video-Agent': 'studio-v1' } });
  assert.equal(empty.status, 200); assert.equal((await empty.json()).replayed, true);
  deleteJob(jobId); inserted = undefined;
  // A removed job still cannot be charged again if a persistent submission reservation exists.
  const receipt = path.join(AGENT_DIR, pkg.id + '.submission.json');
  assert.equal(fs.existsSync(receipt), false); fs.writeFileSync(receipt, JSON.stringify({ planId: pkg.id, jobId, technicalCanary: true }), { flag: 'wx' });
  assert.equal((await post(`/api/agent/plans/${pkg.id}/generate`, options)).status, 409);
  const result = { checkedOn: '2026-10-08', realLocalHTTP: true, prepareReplay: true, preview: true, noConfirmationRequired: true, optionalBudgetValidation: true, foreignOriginGuard: true,
    terminalJobReplay: true, removedJobGuard: true, providerRequests: 0, creativeGeneration: false, planId: pkg.id, compositionUrl: pkg.compositionUrl };
  fs.mkdirSync('storage/research', { recursive: true }); fs.writeFileSync('storage/research/agent-workflow-http.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  if (inserted) deleteJob(inserted);
  if (pkg) { for (const suffix of ['.submission.json']) { const file = path.join(AGENT_DIR, pkg.id + suffix); if (fs.existsSync(file)) fs.unlinkSync(file); } }
  assert.equal((db().prepare('SELECT COUNT(*) AS count FROM jobs').get() as { count: number }).count, countBefore);
  // Keep this harmless prepared fixture temporarily for rendered-page verification; no sources or paid job attached.
}
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
