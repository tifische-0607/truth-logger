import { z } from 'zod';

// Project identity and workflow fields are deliberately excluded.
export const projectDetailsSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.'),
  summary: z.string().trim().transform(value => value || null),
  due_on: z.string().refine(value => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Choose a valid due date.').transform(value => value || null),
});