
// @ts-nocheck
'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { generateFlashcards, Flashcard } from '@/ai/flows/generate-flashcards';
import { lookupWordWithAI, type LookupWordOutput } from '@/ai/flows/lookup-word-flow';
import FlashcardReview from '@/components/flashcard-review';
import ChapterTextRenderer from '@/components/chapter-text-renderer';
import { chapters } from '@/data/chapters';
import { getWordsForChapter, WordInfo, getWordInfo } from '@/data/words';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ChevronLeft, ChevronRight, BookOpenCheck, RotateCcw } from 'lucide-react';

type LookupInfo = LookupWordOutput & { word: string };
type WordCache = Map<string, LookupWordOutput>;

export default function ChapterPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const chapterId = parseInt(params.chapterId as string, 10);

  const [chapterData, setChapterData] = useState<{ id: number; title: string; content: string } | null>(null);
  const [interactiveWords, setInteractiveWords] = useState<WordInfo[]>([]);
  const [difficultWords, setDifficultWords] = useState<Set<string>>(new Set());
  const [lookupInfo, setLookupInfo] = useState<LookupInfo | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [currentLookupWord, setCurrentLookupWord] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(null);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const [isLoadingChapter, setIsLoadingChapter] = useState(true);
  const [showCompletionMessage, setShowCompletionMessage] = useState(false);

  const wordCacheRef = useRef<WordCache>(new Map());

  const resetChapterState = useCallback(() => {
    setDifficultWords(new Set());
    setLookupInfo(null);
    setCurrentLookupWord(null);
    setIsLookingUp(false);
    setFlashcards(null);
    setShowFlashcards(false);
    setShowCompletionMessage(false);
    localStorage.removeItem(`difficultWords_chapter_${chapterId}`);
    toast({
      title: "Chapter Restarted",
      description: "All marked words and lookups have been cleared for this chapter.",
    });
  }, [chapterId, toast]);


  useEffect(() => {
    setIsLoadingChapter(true);
    const currentChapter = chapters.find(ch => ch.id === chapterId);
    if (currentChapter) {
      setChapterData(currentChapter);
      const wordsForThisChapter = getWordsForChapter(chapterId, currentChapter.content);
      console.log(`Words for chapter ${chapterId} (from getWordsForChapter):`, wordsForThisChapter);
      setInteractiveWords(wordsForThisChapter);

      try {
        const storedDifficult = localStorage.getItem(`difficultWords_chapter_${chapterId}`);
        if (storedDifficult) {
          const parsedDifficult = JSON.parse(storedDifficult);
          if (Array.isArray(parsedDifficult)) {
            setDifficultWords(new Set(parsedDifficult));
          } else {
            setDifficultWords(new Set());
          }
        } else {
          setDifficultWords(new Set());
        }
      } catch (error) {
        console.error("Error parsing difficult words from localStorage:", error);
        setDifficultWords(new Set());
      }
    } else {
      router.replace('/chapter/1');
      return;
    }

    setLookupInfo(null);
    setCurrentLookupWord(null);
    setFlashcards(null);
    setShowFlashcards(false);
    setShowCompletionMessage(false);
    setIsLookingUp(false);
    setIsLoadingChapter(false);
  }, [chapterId, router]);

  useEffect(() => {
    if (!isLoadingChapter && chapterData) {
      localStorage.setItem(`difficultWords_chapter_${chapterId}`, JSON.stringify(Array.from(difficultWords)));
    }
  }, [difficultWords, chapterId, isLoadingChapter, chapterData]);

  const handleWordClick = useCallback(async (word: string) => {
    console.log(`Restored handleWordClick for: ${word}`);
    setLookupInfo(null); 
    setCurrentLookupWord(word); 
    setIsLookingUp(true); 

    try {
      const localWordInfo = getWordInfo(word);

      if (localWordInfo) {
        console.log(`Found local data for "${word}":`, localWordInfo);
        setLookupInfo({ ...localWordInfo, word });
        setIsLookingUp(false); 

        setDifficultWords(prev => {
          const newSet = new Set(prev);
          newSet.add(word);
          return newSet;
        });
      } else {
        console.log(`Word "${word}" not found locally. Triggering AI...`);
        const aiResult = await lookupWordWithAI({ word });
        console.log(`AI lookup for "${word}" completed. Result:`, aiResult);

        if (aiResult && typeof aiResult.pinyin === 'string' && typeof aiResult.translation === 'string') {
          wordCacheRef.current.set(word, aiResult);
          if (currentLookupWord === word) { 
            setLookupInfo({ ...aiResult, word });
          }
          if (aiResult.pinyin === '?' || aiResult.translation.includes('(AI lookup failed')) {
            toast({
              title: "Lookup Partially Failed",
              description: `AI could not fully process "${word}". Displaying available info.`,
              variant: "destructive",
            });
          }
          setDifficultWords(prev => {
            const newSet = new Set(prev);
            newSet.add(word);
            return newSet;
          });
        } else {
          console.error('AI returned invalid data structure:', aiResult);
          if (currentLookupWord === word) {
            setLookupInfo({ pinyin: '?', translation: '(Invalid AI Format)', word });
          }
          toast({
            title: "AI Error",
            description: `Received invalid format from AI for "${word}".`,
            variant: "destructive",
          });
        }
        setIsLookingUp(false); 
      }
    } catch (error) {
      console.error(`Error during word lookup for "${word}":`, error);
      if (currentLookupWord === word) {
        setLookupInfo({ word, pinyin: 'Error', translation: 'Lookup Failed' });
      }
      setIsLookingUp(false); 
      toast({
        title: "Lookup Error",
        description: `An unexpected error occurred for "${word}".`,
        variant: "destructive",
      });
    }
  }, [currentLookupWord, toast]);


  const handleGenerateFlashcards = useCallback(async () => {
    setShowCompletionMessage(false);
    const difficultWordsArray = Array.from(difficultWords);
    if (difficultWordsArray.length === 0) {
      toast({
        title: "No Difficult Words Marked",
        description: "Click on words in the text to mark them as difficult before reviewing.",
      });
      return;
    }

    setIsGenerating(true);
    setFlashcards(null);
    try {
      const prefetchedDetails: Record<string, { pinyin: string; translation: string }> = {};
      for (const word of difficultWordsArray) {
        const localData = getWordInfo(word);
        if (localData) {
          prefetchedDetails[word] = { pinyin: localData.pinyin, translation: localData.translation };
        } else {
          const cachedData = wordCacheRef.current.get(word);
          if (cachedData) {
            prefetchedDetails[word] = { pinyin: cachedData.pinyin, translation: cachedData.translation };
          }
        }
      }

      const result = await generateFlashcards({
        difficultWords: difficultWordsArray,
        prefetchedDetails: prefetchedDetails,
      });

      if (result && Array.isArray(result.flashcards)) {
        setFlashcards(result.flashcards);
        setShowFlashcards(true);
      } else {
        throw new Error("Invalid flashcard data received.");
      }
    } catch (error) {
      console.error("Error generating flashcards:", error);
      toast({
        title: "Flashcard Generation Failed",
        description: "Could not generate flashcards. Check console for details.",
        variant: "destructive",
      });
      setFlashcards(null);
    } finally {
      setIsGenerating(false);
    }
  }, [difficultWords, toast, wordCacheRef]);

  const handleNextChapter = useCallback(() => {
    const nextChapterId = chapterId + 1;
    if (chapters.some(ch => ch.id === nextChapterId)) {
      router.push(`/chapter/${nextChapterId}`);
    } else {
      toast({
        title: "Congratulations!",
        description: "You have completed all available chapters.",
      });
      setShowCompletionMessage(true);
    }
  }, [chapterId, router, toast]);

  const handlePreviousChapter = useCallback(() => {
    const previousChapterId = chapterId - 1;
    if (chapters.some(ch => ch.id === previousChapterId)) {
      router.push(`/chapter/${previousChapterId}`);
    } else {
      toast({ title: "Already at the first chapter." });
    }
  }, [chapterId, router, toast]);

  const handleFinishReview = useCallback(() => {
    setShowFlashcards(false);
    const nextChapterId = chapterId + 1;
    if (chapters.some(ch => ch.id === nextChapterId)) {
       handleNextChapter();
    } else {
      setShowCompletionMessage(true);
    }
  }, [chapterId, handleNextChapter]);
  
  const handlePopoverClose = useCallback(() => {
       console.log(`Popover closed for word: "${currentLookupWord}" (event from ChapterPage)`);
       setLookupInfo(null); 
       setCurrentLookupWord(null); 
   }, [currentLookupWord]);

  const handleChapterButtonClick = (newChapterId: number) => {
    if (newChapterId !== chapterId && newChapterId >= 1 && newChapterId <= chapters.length) {
      router.push(`/chapter/${newChapterId}`);
    }
  };


  if (isLoadingChapter) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-muted-foreground">Loading Chapter {chapterId}...</p>
      </div>
    );
  }

  if (!chapterData) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-destructive">Error loading chapter data. Redirecting...</p>
      </div>
    );
  }

  if (showFlashcards && flashcards) {
    return <FlashcardReview flashcards={flashcards} onFinish={handleFinishReview} />;
  }

  if (showCompletionMessage) {
    return (
      <Card className="w-full max-w-lg mx-auto shadow-lg rounded-lg mt-10 animate-in fade-in duration-500">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold text-primary">🎉 Congratulations! 🎉</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4 p-6">
          <p className="text-lg text-muted-foreground">
            You have completed all available chapters.
          </p>
          <p>Keep practicing to solidify your learning!</p>
          <Button onClick={() => router.push('/chapter/1')} variant="outline" className="mt-4">
            Review Chapter 1
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Chapter Navigation Buttons - MOVED HERE */}
      <div className="mb-8 p-4 border rounded-lg shadow-sm bg-card">
        <div className="flex justify-between items-center mb-3">
          <label htmlFor="chapter-navigation" className="text-sm font-medium text-muted-foreground">
            Quick Chapter Select:
          </label>
          <span className="text-sm font-semibold text-primary">
            Chapter {chapterId} of {chapters.length}
          </span>
        </div>
        <div id="chapter-navigation" className="flex flex-wrap gap-2">
          {chapters.map((chapter) => (
            <Button
              key={chapter.id}
              variant={chapter.id === chapterId ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleChapterButtonClick(chapter.id)}
              disabled={isLoadingChapter}
              className="transition-all duration-150 ease-in-out"
            >
              {chapter.id}
            </Button>
          ))}
        </div>
      </div>

      <Card className="shadow-lg rounded-lg overflow-hidden mb-8">
        <CardHeader className="border-b pb-4 bg-muted/30">
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="icon" onClick={handlePreviousChapter} disabled={chapterId <= 1} aria-label="Previous Chapter">
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <div className="text-center flex-grow px-4">
              <CardTitle className="text-2xl md:text-3xl font-bold">{chapterData.title}</CardTitle>
              <CardDescription>Chapter {chapterId}</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={handleNextChapter} disabled={chapterId >= chapters.length} aria-label="Next Chapter">
              <ChevronRight className="h-6 w-6" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 md:p-8">
          <ChapterTextRenderer
            content={chapterData.content}
            interactiveWords={interactiveWords}
            onWordClick={handleWordClick}
            isLookingUp={isLookingUp}
            currentLookupWord={currentLookupWord}
            lookupInfo={lookupInfo}
            difficultWords={difficultWords}
            onPopoverClose={handlePopoverClose}
          />
        </CardContent>
      </Card>

      <div className="flex justify-between items-center mt-6 space-x-4">
        <Button
            onClick={resetChapterState}
            variant="outline"
            className="transition-all duration-300 ease-in-out transform hover:scale-105"
            aria-label="Restart Chapter"
        >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restart Chapter
        </Button>
        <div className="flex space-x-4">
            <Button
            onClick={handleGenerateFlashcards}
            disabled={isGenerating || difficultWords.size === 0}
            variant={difficultWords.size > 0 ? "default" : "secondary"}
            className="transition-all duration-300 ease-in-out transform hover:scale-105"
            >
            {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
                <BookOpenCheck className="mr-2 h-4 w-4" />
            )}
            {difficultWords.size > 0 ? `Review ${difficultWords.size} Marked Word${difficultWords.size > 1 ? 's' : ''}` : "Review Marked Words"}
            </Button>

            {chapterId < chapters.length ? (
            <Button onClick={handleNextChapter} variant="outline" disabled={isLoadingChapter}>
                Next Chapter <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
            ) : (
            <Button onClick={handleFinishReview} variant="default" disabled={isLoadingChapter}>
                Finish Course <BookOpenCheck className="ml-1 h-4 w-4" />
            </Button>
            )}
        </div>
      </div>
    </div>
  );
}

