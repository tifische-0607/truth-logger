import { describe, expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { buildDataset, buildFindingsTables, sha256Hex } from './engagement-outputs';
import type { Workspace } from './projects';

describe('generated document integrity', () => {
  const workspace = {
    project: { code: 'Sample' }, briefInForce: { version: 1 },
    candidates: [], decisions: new Map(), tiers: new Map(),
  } as unknown as Workspace;
  for (const [kind, build] of [['dataset', buildDataset], ['findings', buildFindingsTables]] as const) {
    it(`hashes the complete generated ${kind} file before storing its metadata`, async () => {
      const output = await build(workspace);
      const bytes = await output.blob.arrayBuffer();
      expect(output.sha256).toBe(await sha256Hex(bytes));
      expect(output.sizeBytes).toBe(bytes.byteLength);
      expect(output.sha256).not.toBe(await sha256Hex(new ArrayBuffer(0)));
    });
  }
});