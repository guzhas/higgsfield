import type { AdPlan } from './ad-plan';
import type { SceneAcoustics } from './scene-audio';

export interface AgentBrief {
  schemaVersion: 1;
  request: string;
  format: { aspectRatio: '9:16' | '16:9' | '1:1'; resolution: '480p' | '720p' };
  subject: { kind: 'fictional' | 'authorized'; description: string; permission?: string };
  location: { name: string; viewpoint: string; minimumReferences: number };
  dialogue: { text: string; language: string; delivery: string };
  audio: { mode: 'native' | 'reference' | 'original' | 'silent'; voiceoverImportId?: string; referenceAssetId?: string; soundscape?: string; acoustics?: SceneAcoustics };
  scenes: { duration: number; action: string; camera: string; caption?: string }[];
  finishing?: string;
  references: { assetId: string; sourceUrl?: string; provenance?: string; rights?: string; role: string; usage: 'location' | 'subject' | 'product' | 'style';
    review?: { sha256: string; method: 'vision'; reviewer: string; locationMatch: boolean; viewpointMatch: boolean; usable: boolean; observations: string } }[];
}
export interface AgentPackage {
  schemaVersion: 1;
  id: string;
  brief: AgentBrief;
  status: 'blocked' | 'ready';
  blockers: string[];
  warnings: string[];
  prompt: string;
  generationRequest: Record<string, unknown> | null;
  adPlan: AdPlan;
  compositionUrl: string;
  generationStarted: false;
  capabilities: { referenceAudio: 'experimental'; exactLipSync: false; vision: 'optional-external-agent-review' };
}
