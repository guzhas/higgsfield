import { agentJson, assertAgentRequest } from '@/lib/agent-plans';
import { generateAgentPlan, parseAgentGenerationOptions, agentResponseError } from '@/lib/agent-generation';
export const runtime = 'nodejs';
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const origin = assertAgentRequest(req, true);
    const options = parseAgentGenerationOptions(!req.body || req.headers.get('content-length') === '0' ? {} : await agentJson(req));
    return Response.json(await generateAgentPlan((await context.params).id, origin, options));
  }
  catch (e) { return agentResponseError(e); }
}
