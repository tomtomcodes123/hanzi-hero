'use server';

/**
 * @fileOverview This file defines a Genkit flow for looking up the Pinyin transcription and English translation of a Chinese word using an AI model.
 *
 * - lookupWordWithAI - A function that handles the AI-powered word lookup process.
 */

import {ai} from '@/ai/ai-instance';
import { LookupWordInputSchema, LookupWordOutputSchema, type LookupWordInput, type LookupWordOutput } from '@/ai/schemas/lookup-word-schemas'; // Import schemas and types from the new file
import {z} from 'zod'; // Keep zod import for internal use if needed, though likely unnecessary now

// Exported wrapper function to call the flow
export async function lookupWordWithAI(input: LookupWordInput): Promise<LookupWordOutput> {
  // Add basic validation or error handling if needed before calling the flow
  if (!input.word) {
    // Return a structured error response instead of throwing
    console.error("Input word cannot be empty.");
    return { pinyin: '?', translation: '(Invalid input)' };
  }
  try {
    const result = await lookupWordFlow(input);
    // Ensure the output matches the expected schema, handle potential null/undefined output from AI
    const parseResult = LookupWordOutputSchema.safeParse(result);
     if (!parseResult.success) {
        console.error("AI returned invalid data structure for word:", input.word, "Received:", result, "Errors:", parseResult.error);
        return { pinyin: '?', translation: '(AI lookup failed - invalid format)' }; // Return a placeholder on invalid format
      }
    return parseResult.data;
  } catch (error) {
     console.error(`Error in lookupWordFlow for word "${input.word}":`, error);
     // Return a placeholder error response to the client
     return { pinyin: '?', translation: '(AI lookup failed - error)' };
  }
}

// Define the prompt for the AI model
const lookupPrompt = ai.definePrompt({
  name: 'lookupWordPrompt',
  input: { schema: LookupWordInputSchema },
  output: { schema: LookupWordOutputSchema }, // Specify the expected output format
  prompt: `Given the Chinese word "{{word}}", provide its Pinyin transcription and a concise English translation. Respond strictly in the following JSON format: {"pinyin": "...", "translation": "..."}.`,
});


// Define the Genkit flow
const lookupWordFlow = ai.defineFlow(
  {
    name: 'lookupWordFlow',
    inputSchema: LookupWordInputSchema,
    outputSchema: LookupWordOutputSchema, // Use the defined output schema
  },
  async (input): Promise<LookupWordOutput> => { // Ensure return type matches expected output schema
    console.log(`AI lookup request for word: ${input.word}`); // Log the request
    // Call the AI prompt
    const response = await lookupPrompt(input);
    const output = response.output; // This should already conform to LookupWordOutputSchema if AI follows instructions

     // Validate the AI output structure rigorously before returning using Zod's safeParse
     const parseResult = LookupWordOutputSchema.safeParse(output);
    if (!parseResult.success) {
        console.error("AI returned invalid data structure:", output, "for word:", input.word, "Errors:", parseResult.error);
        // Return a structured error object compliant with LookupWordOutput schema
        return { pinyin: '?', translation: '(AI lookup failed - invalid format)' };
    }

     console.log(`AI lookup successful for word: ${input.word}`); // Log success
    return parseResult.data; // Return the validated and typed output
  }
);

// --- DO NOT EXPORT SCHEMAS OR TYPES FROM HERE ---