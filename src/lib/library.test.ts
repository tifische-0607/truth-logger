import { describe, expect, it } from 'vitest';
import { audienceOf } from './library';

const base = { voided: false, visibility: 'staff_only', output_id: null, output_status: null };
describe('library audience', () => {
  it('a held output is shown as Held', () => expect(audienceOf({ ...base, output_id: 'x', output_status: 'held' })).toBe('held'));
  it('a released shared output is shown as shared', () => expect(audienceOf({ ...base, visibility: 'client', output_id: 'x', output_status: 'released' })).toBe('shared'));
  it('a void document is void even if it was shared', () => expect(audienceOf({ ...base, voided: true, visibility: 'client' })).toBe('void'));
  it('a plain staff document is staff only', () => expect(audienceOf(base)).toBe('staff'));
});
