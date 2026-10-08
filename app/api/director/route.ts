import { assertAgentRequest, agentJson } from '@/lib/agent-plans';
import { agentResponseError } from '@/lib/agent-generation';
import { prepareDirector, parseDirectorInput, generateDirector, recoverDirector, reviewDirector } from '@/lib/director';
import { elevenVoices, setElevenKey, elevenKey } from '@/lib/director-voice';
import { hasCredentials } from '@/lib/higgsfield';
import { hasOpenRouterCredentials } from '@/lib/openrouter';
import { localInlineReferences, inlineAudioTransportIssue } from '@/lib/reference-transport';
export const runtime='nodejs';
export const maxDuration=900;
export async function GET(req:Request){
  try{assertAgentRequest(req);const action=new URL(req.url).searchParams.get('action');
    if(action==='voices')return Response.json(await elevenVoices());
    if(action==='recover')return Response.json(recoverDirector(new URL(req.url).searchParams.get('requestId')??''));
    return Response.json({openRouterConfigured:hasOpenRouterCredentials(),storageConfigured:localInlineReferences()||hasCredentials(),higgsfieldConfigured:hasCredentials(),referenceTransport:localInlineReferences()?'local_inline':'higgsfield',referenceTransportIssue:inlineAudioTransportIssue()??null,elevenConfigured:Boolean(elevenKey())});
  }catch(e){return agentResponseError(e);}
}
export async function POST(req:Request){
  try{assertAgentRequest(req,true);const body=await agentJson(req) as Record<string,unknown>;
    if(body.action==='connectVoice'){setElevenKey(String(body.key??''));return Response.json(await elevenVoices());}
    if(body.action==='prepare')return Response.json(await prepareDirector(parseDirectorInput(body.input)));
    if(body.action==='generate')return Response.json(await generateDirector(String(body.id),body.maximumUsd===undefined?undefined:Number(body.maximumUsd)));
    if(body.action==='review')return Response.json(await reviewDirector(String(body.id),String(body.outputId)));
    return Response.json({error:'Nežinomas veiksmas.'},{status:400});
  }catch(e){return agentResponseError(e);}
}
