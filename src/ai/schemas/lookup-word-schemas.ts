/**
 * @fileOverview Defines Zod schemas and TypeScript types for the AI word lookup flow.
 * This allows separating schema definitions from the 'use server' flow file.
 */

import {z} from 'zod';

// Define the input schema for the AI lookup
export const LookupWordInputSchema = z.object({
  word: z.string().describe('The Chinese word to look up.'),
});
export type LookupWordInput = z.infer<typeof LookupWordInputSchema>;

// Define the output schema expected from the AI
export const LookupWordOutputSchema = z.object({
  pinyin: z.string().describe('The Pinyin transcription of the word.'),
  translation: z.string().describe('A concise English translation for the word.'),
});
export type LookupWordOutput = z.infer<typeof LookupWordOutputSchema>;