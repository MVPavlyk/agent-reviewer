import { z } from 'zod';
import { MAX_CONVENTIONS_PER_SCAN } from './constants.js';

/** One LLM-proposed convention. `file` must be one of the sampled paths —
 *  the service drops anything else rather than trusting a hallucinated path. */
export const DetectedConvention = z.object({
  title: z.string().min(1).max(120),
  rule: z.string().min(1),
  file: z.string().min(1),
  start_line: z.number().int().positive(),
  end_line: z.number().int().positive(),
  snippet: z.string().min(1),
  confidence: z.number().min(0).max(1),
});
export type DetectedConvention = z.infer<typeof DetectedConvention>;

export const DetectedConventionsSchema = z.object({
  conventions: z.array(DetectedConvention).max(MAX_CONVENTIONS_PER_SCAN),
});
export type DetectedConventionsResult = z.infer<typeof DetectedConventionsSchema>;
