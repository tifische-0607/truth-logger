import { describe, expect, it } from 'vitest';
import { projectDetailsSchema } from './project-details';

describe('project detail edits', () => {
  it('allows name, summary and due date without changing identity or approval fields', () => {
    expect(projectDetailsSchema.parse({ name: ' Updated project ', summary: ' Details ', due_on: '2027-07-31', client_id: 'other-client', code: 'NEW', status: 'delivered', design_stale: false })).toEqual({ name: 'Updated project', summary: 'Details', due_on: '2027-07-31' });
  });
  it('allows clearing optional details', () => {
    expect(projectDetailsSchema.parse({ name: 'Project', summary: ' ', due_on: '' })).toEqual({ name: 'Project', summary: null, due_on: null });
  });
  it('refuses a blank name', () => {
    expect(projectDetailsSchema.safeParse({ name: ' ', summary: '', due_on: '' }).success).toBe(false);
  });
});