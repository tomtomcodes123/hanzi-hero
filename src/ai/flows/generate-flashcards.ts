
'use server';

/**
 * @fileOverview Generates flashcards based on a list of difficult words.
 * Includes placeholder logic for fetching pinyin/translation if not provided.
 *
 * - generateFlashcards - A function that takes difficult words and formats them into flashcards.
 * - GenerateFlashcardsInput - The input type for the generateFlashcards function.
 * - GenerateFlashcardsOutput - The return type for the generateFlashcards function.
 */

import {ai} from '@/ai/ai-instance'; // May not be needed if AI lookup is fully removed or handled externally
import { lookupWordWithAI } from '@/ai/flows/lookup-word-flow'; // Needed for fallback lookup
import { type LookupWordOutput } from '@/ai/schemas/lookup-word-schemas';
import {z} from 'zod';

// --- Input / Output Schemas ---

// Input can optionally include pre-fetched details to optimize
const WordDetailSchema = z.object({
  pinyin: z.string(),
  translation: z.string(), // Assuming single primary translation for simplicity
});

const GenerateFlashcardsInputSchema = z.object({
  difficultWords: z
    .array(z.string())
    .describe('An array of words the user found difficult in the chapter.'),
  // OPTIONAL: Pass pre-fetched details from client cache/local data
  // This allows skipping lookups within this server action.
  // Key: the word (character), Value: its details
  prefetchedDetails: z.record(z.string(), WordDetailSchema).optional().describe('Pre-fetched pinyin and translation for words, if available.'),
});
export type GenerateFlashcardsInput = z.infer<typeof GenerateFlashcardsInputSchema>;

const FlashcardSchema = z.object({
  character: z.string().describe('The Chinese word.'),
  pinyin: z.string().describe('The Pinyin transcription.'), // Now mandatory, fetched if needed
  translations: z.array(z.string()).describe('English translations.'), // Use array for potential multiple translations
});
export type Flashcard = z.infer<typeof FlashcardSchema>;

const GenerateFlashcardsOutputSchema = z.object({
  flashcards: z.array(FlashcardSchema).describe('An array of flashcards for the difficult words, including pinyin and translation.'),
});
export type GenerateFlashcardsOutput = z.infer<typeof GenerateFlashcardsOutputSchema>;


// --- Main Function ---

/**
 * Generates flashcards for the given difficult words.
 * It prioritizes pre-fetched details if provided.
 * If details are missing for a word, it attempts to look them up using the lookupWordWithAI flow.
 */
export async function generateFlashcards(input: GenerateFlashcardsInput): Promise<GenerateFlashcardsOutput> {
  const flashcards: Flashcard[] = [];
  const wordsToLookup: string[] = [];
  const lookupResults = new Map<string, LookupWordOutput>();

  console.log(`generateFlashcards: Received ${input.difficultWords.length} words. Prefetched details count: ${Object.keys(input.prefetchedDetails || {}).length}`);

  // --- Step 1: Process words with pre-fetched details ---
  for (const word of input.difficultWords) {
    const details = input.prefetchedDetails?.[word];
    if (details) {
      flashcards.push({
        character: word,
        pinyin: details.pinyin,
        translations: [details.translation], // Assuming single translation from prefetch
      });
      console.log(`generateFlashcards: Used pre-fetched details for "${word}"`);
    } else {
      // If no pre-fetched details, mark for lookup
      wordsToLookup.push(word);
    }
  }

  // --- Step 2: Lookup missing words (if any) ---
  if (wordsToLookup.length > 0) {
    console.log(`generateFlashcards: Need to look up details for ${wordsToLookup.length} words:`, wordsToLookup);
    // Consider parallelizing lookups if the AI flow/service supports it safely
    // For simplicity, doing sequential lookups here.
    // WARNING: Sequential lookups can be slow for many words.
    const lookupStartTime = performance.now();
    for (const word of wordsToLookup) {
       try {
          const result = await lookupWordWithAI({ word });
           // Store result even if it indicates an error (e.g., pinyin: '?')
           // to avoid retrying and to potentially show partial info.
           lookupResults.set(word, result);
           console.log(`generateFlashcards: Looked up "${word}". Result:`, result);
       } catch (error) {
           console.error(`generateFlashcards: Error looking up "${word}":`, error);
           // Store an error state
           lookupResults.set(word, { pinyin: '?', translation: '(Lookup Error)' });
       }
    }
     const lookupEndTime = performance.now();
     console.log(`generateFlashcards: Finished ${wordsToLookup.length} lookups in ${lookupEndTime - lookupStartTime}ms.`);


    // --- Step 3: Add looked-up words to flashcards array ---
    for (const word of wordsToLookup) {
      const result = lookupResults.get(word);
      if (result) {
        flashcards.push({
          character: word,
          pinyin: result.pinyin,
          translations: [result.translation], // Assuming single translation from AI
        });
      } else {
         // Should not happen if we store error states, but handle defensively
         flashcards.push({
           character: word,
           pinyin: '?',
           translations: ['(Lookup Failed)'],
         });
      }
    }
  }

  console.log(`generateFlashcards: Returning ${flashcards.length} flashcards.`);
  return { flashcards };
}

// Note: No explicit ai.defineFlow is needed here if this function purely orchestrates.
// If more complex logic, tracing, or input/output schema enforcement via Genkit's flow mechanism
// is desired, this logic could be wrapped in an ai.defineFlow.
// However, for this task, a simple async server action function is sufficient.
