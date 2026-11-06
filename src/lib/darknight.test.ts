import { describe, expect, it } from 'vitest';
import { DARKNIGHT_UNAVAILABLE, FakeDarkNight, outputHomePath, readArtefactWith, runEvidenceMove, writeOutput, type Pending } from './darknight';
import { sha256OfBuffer } from './vault-download';

const GW = 'https://darknight.example';
const bytes = (s: string) => new TextEncoder().encode(s);
const hex = (s: string) => sha256OfBuffer(bytes(s).slice().buffer);

async function setup(names: string[]) {
  const cloud = new Map<string, Uint8Array>(names.map((n) => [n, bytes(`file ${n}`)]));
  const pending: Pending[] = await Promise.all(names.map(async (n, i) => ({ artefact_id: `a${i}`, storage_path: n, sha256: await hex(`file ${n}`), filename: n })));
  const gw = new FakeDarkNight((url) => cloud.get(url.replace('signed:', '')));
  const results: string[] = [];
  // Mirrors evidence_move_record: verified only when DarkNight's hash equals the recorded one.
  const record = async (r: { artefact: string; got: string | null; unavailable: boolean }) => {
    const a = pending.find((p) => p.artefact_id === r.artefact)!;
    const out = r.unavailable ? 'unavailable' : r.got === a.sha256 ? 'verified' : 'mismatch';
    results.push(`${a.filename}:${out}`); return out;
  };
  return { cloud, pending, gw, results, record };
}

describe('U3 evidence move', () => {
  it('moves every file under its existing path and verifies each hash', async () => {
    const s = await setup(['CASE-1/INC-1_2026-09-21/FB_@a/POST-1/artefacts/a.png', 'CASE-1/INC-1_2026-09-21/FB_@a/POST-1/artefacts/b.json']);
    const r = await runEvidenceMove({ gatewayUrl: GW, runId: 'r', token: 't', pending: s.pending, fetcher: s.gw.fetch, signSource: async (p) => `signed:${p}`, record: s.record });
    expect(r).toEqual({ verified: 2, unavailable: 0, stoppedBy: null });
    expect([...s.gw.files.keys()]).toEqual(s.pending.map((p) => `evidence/${p.storage_path}`));
  });

  it('a hash mismatch stops the whole move at once and names the artefact', async () => {
    const s = await setup(['C/1.png', 'C/2.png', 'C/3.png']);
    s.gw.tamper.add('C/2.png');
    const r = await runEvidenceMove({ gatewayUrl: GW, runId: 'r', token: 't', pending: s.pending, fetcher: s.gw.fetch, signSource: async (p) => `signed:${p}`, record: s.record });
    expect(r.stoppedBy?.filename).toBe('C/2.png');
    expect(s.results).toEqual(['C/1.png:verified', 'C/2.png:mismatch']);
  });

  it('never changes the cloud originals', async () => {
    const s = await setup(['C/1.png']);
    const before = [...s.cloud.entries()].map(([k, v]) => [k, [...v]]);
    await runEvidenceMove({ gatewayUrl: GW, runId: 'r', token: 't', pending: s.pending, fetcher: s.gw.fetch, signSource: async (p) => `signed:${p}`, record: s.record });
    expect([...s.cloud.entries()].map(([k, v]) => [k, [...v]])).toEqual(before);
  });

  it('records an unreachable gateway as not reached, never verified', async () => {
    const s = await setup(['C/1.png']);
    s.gw.online = false;
    const r = await runEvidenceMove({ gatewayUrl: GW, runId: 'r', token: 't', pending: s.pending, fetcher: s.gw.fetch, signSource: async (p) => `signed:${p}`, record: s.record });
    expect(r).toEqual({ verified: 0, unavailable: 1, stoppedBy: null });
  });
});

describe('U3 switched reads', () => {
  const path = 'C/1.png';
  it('unverified artefacts keep reading from the cloud', async () => {
    const gw = new FakeDarkNight();
    const r = await readArtefactWith({ artefact_id: 'a', sha256: await hex('x'), moved: false, gateway_url: null, darknight_path: null }, path, 't', async () => bytes('x').slice().buffer, gw.fetch);
    expect(r.ok && r.from).toBe('cloud');
  });

  it('verified artefacts read from DarkNight with the hash re-checked', async () => {
    const gw = new FakeDarkNight();
    gw.files.set(`evidence/${path}`, bytes('x'));
    const loc = { artefact_id: 'a', sha256: await hex('x'), moved: true, gateway_url: GW, darknight_path: path };
    const ok = await readArtefactWith(loc, path, 't', async () => { throw new Error('cloud must not be used'); }, gw.fetch);
    expect(ok.ok && ok.from).toBe('darknight');
    gw.files.set(`evidence/${path}`, bytes('changed'));
    const bad = await readArtefactWith(loc, path, 't', async () => bytes('x').slice().buffer, gw.fetch);
    expect(bad.ok).toBe(false);
  });

  it('shows the offline message when the gateway is unreachable', async () => {
    const gw = new FakeDarkNight();
    gw.online = false;
    const r = await readArtefactWith({ artefact_id: 'a', sha256: await hex('x'), moved: true, gateway_url: GW, darknight_path: path }, path, 't', async () => bytes('x').slice().buffer, gw.fetch);
    expect(r).toEqual({ ok: false, from: 'darknight', message: DARKNIGHT_UNAVAILABLE });
    expect(DARKNIGHT_UNAVAILABLE).toBe('Temporarily unavailable, please try again later');
  });
});

describe('U3 engagement outputs', () => {
  it('writes to DarkNight under a hash-qualified path and refuses overwrites', async () => {
    const gw = new FakeDarkNight();
    const sha = await hex('pdf');
    const p = outputHomePath('proj', 'out', sha, 'brief v1.pdf');
    expect(p).toBe(`projects/proj/outputs/out/${sha}/brief_v1.pdf`);
    expect(await writeOutput(GW, p, new Blob([bytes('pdf')]), sha, 't', gw.fetch)).toEqual({ ok: true });
    expect((await writeOutput(GW, p, new Blob([bytes('pdf')]), sha, 't', gw.fetch)).ok).toBe(false);
  });
  it('offline gateway gives the offline message and nothing is recorded', async () => {
    const gw = new FakeDarkNight(); gw.online = false;
    expect(await writeOutput(GW, 'projects/p/x', new Blob([bytes('a')]), await hex('a'), 't', gw.fetch)).toEqual({ ok: false, message: DARKNIGHT_UNAVAILABLE });
    expect(await writeOutput(null, 'projects/p/x', new Blob([bytes('a')]), await hex('a'), 't', gw.fetch)).toEqual({ ok: false, message: DARKNIGHT_UNAVAILABLE });
  });
});
