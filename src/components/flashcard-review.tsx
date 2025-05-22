'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { type Flashcard } from '@/ai/flows/generate-flashcards';
import { Check, X, RotateCcw, Loader2 } from 'lucide-react';

interface FlashcardReviewProps {
  flashcards: Flashcard[];
  onFinish: () => void;
}

export default function FlashcardReview({ flashcards, onFinish }: FlashcardReviewProps) {
  const [originalFlashcards, setOriginalFlashcards] = useState<Flashcard[]>([]);
  const [currentDeck, setCurrentDeck] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  
  const [wordsToReReview, setWordsToReReview] = useState<Set<string>>(new Set());
  const [knownWordsFromOriginalSet, setKnownWordsFromOriginalSet] = useState<Set<string>>(new Set());

  const [showSummary, setShowSummary] = useState(false);
  
  useEffect(() => {
    if (flashcards && flashcards.length > 0) {
      const sanitizedFlashcards = flashcards.map(fc => ({
        ...fc,
        pinyin: fc.pinyin || '...',
        translations: fc.translations && fc.translations.length > 0 ? fc.translations : ['...']
      }));
      setOriginalFlashcards([...sanitizedFlashcards]);
      setCurrentDeck([...sanitizedFlashcards]);
      setWordsToReReview(new Set());
      setKnownWordsFromOriginalSet(new Set());
      setCurrentIndex(0);
      setIsFlipped(false);
      setShowSummary(false);
    } else {
      setOriginalFlashcards([]);
      setCurrentDeck([]);
      setShowSummary(true); 
    }
  }, [flashcards]);

  const currentCard = currentDeck[currentIndex];
  const totalOriginalCards = originalFlashcards.length;
  const progress = totalOriginalCards > 0 ? (knownWordsFromOriginalSet.size / totalOriginalCards) * 100 : 0;


  // Effect to handle end-of-pass logic and deck rebuilding
  useEffect(() => {
    if (currentDeck.length > 0 && currentIndex >= currentDeck.length) {
        // Current pass has just ended
        setIsFlipped(false); // Ensure next card (if any) starts unflipped

        const cardsForNextRound = originalFlashcards.filter(fc => wordsToReReview.has(fc.character));

        if (cardsForNextRound.length > 0) {
            // Shuffle for the next pass
            const shuffledNextRound = [...cardsForNextRound];
            for (let i = shuffledNextRound.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffledNextRound[i], shuffledNextRound[j]] = [shuffledNextRound[j], shuffledNextRound[i]];
            }
            setCurrentDeck(shuffledNextRound);
            setCurrentIndex(0);
        } else if (knownWordsFromOriginalSet.size === totalOriginalCards) {
            // All cards known, no more to re-review
            setShowSummary(true);
        } else {
            // Fallback: No cards in re-review, but not all original cards are known.
            // This might happen if a card was marked known, then unknown, but not properly re-added.
            // Or if original set had cards not reviewed.
            const trulyUnknown = originalFlashcards.filter(fc => !knownWordsFromOriginalSet.has(fc.character));
            if (trulyUnknown.length > 0) {
                 const shuffledUnknown = [...trulyUnknown];
                 for (let i = shuffledUnknown.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledUnknown[i], shuffledUnknown[j]] = [shuffledUnknown[j], shuffledUnknown[i]];
                }
                setCurrentDeck(shuffledUnknown);
                setCurrentIndex(0);
            } else {
                 // All cards are actually known if trulyUnknown is empty
                 setShowSummary(true);
            }
        }
    }
  }, [currentIndex, currentDeck, wordsToReReview, knownWordsFromOriginalSet, originalFlashcards, totalOriginalCards]);


  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleNext = useCallback((knewIt: boolean) => {
    if (!currentCard) return;

    setIsFlipped(false); // Reset flip state for the upcoming card display FIRST

    const reviewedCardChar = currentCard.character;

    // Update known and re-review sets
    setKnownWordsFromOriginalSet(prevKnown => {
        const updated = new Set(prevKnown);
        if (knewIt) {
            updated.add(reviewedCardChar);
        } else {
            updated.delete(reviewedCardChar); // If marked "Don't Know", it's not "known" for progress
        }
        return updated;
    });

    setWordsToReReview(prevReReview => {
        const updated = new Set(prevReReview);
        if (!knewIt) {
            updated.add(reviewedCardChar);
        } else {
            updated.delete(reviewedCardChar); // If "Know", remove from re-review
        }
        return updated;
    });

    // Advance to the next card index. The useEffect will handle deck transitions if needed.
    setCurrentIndex(prev => prev + 1);

  }, [currentCard]); // Dependencies: currentCard is essential to get reviewedCardChar

  const handleRestart = useCallback(() => {
    if (originalFlashcards.length > 0) {
      // Shuffle originalFlashcards for a fresh start
      const shuffledOriginals = [...originalFlashcards];
      for (let i = shuffledOriginals.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffledOriginals[i], shuffledOriginals[j]] = [shuffledOriginals[j], shuffledOriginals[i]];
      }
      setCurrentDeck(shuffledOriginals);
      setWordsToReReview(new Set());
      setKnownWordsFromOriginalSet(new Set());
      setCurrentIndex(0);
      setIsFlipped(false);
      setShowSummary(false);
    } else {
      setShowSummary(true); 
    }
  }, [originalFlashcards]);

  const currentPinyin = currentCard?.pinyin ?? '...';
  const currentTranslations = currentCard?.translations ?? ['...'];
  
  // Key for the card to help React differentiate instances and reset state on change
  const cardKey = currentCard ? `${currentCard.character}-${currentIndex}-${currentDeck.length}` : `loading-${currentIndex}-${currentDeck.length}`;

  if (totalOriginalCards === 0 && showSummary) {
    return (
      <Card className="w-full max-w-md mx-auto shadow-lg rounded-lg mt-10 animate-in fade-in duration-500">
        <CardContent className="p-6 text-center space-y-4">
          <h2 className="text-2xl font-semibold">No Flashcards</h2>
          <p className="text-lg text-muted-foreground">
            There are no flashcards to review.
          </p>
          <Button onClick={onFinish}>Go Back</Button>
        </CardContent>
      </Card>
    );
  }

  if (showSummary) {
    return (
      <Card className="w-full max-w-md mx-auto shadow-lg rounded-lg mt-10 animate-in fade-in duration-500">
        <CardContent className="p-6 text-center space-y-4">
          <h2 className="text-2xl font-semibold">Review Complete!</h2>
          <p className="text-lg text-muted-foreground">
            You reviewed all {totalOriginalCards} unique card{totalOriginalCards !== 1 ? 's' : ''} and marked them as known.
          </p>
          <div className="flex justify-center space-x-4 pt-4">
            <Button onClick={handleRestart} variant="outline">
              <RotateCcw className="mr-2 h-4 w-4" /> Restart Review
            </Button>
            <Button onClick={onFinish}>Continue Learning</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Loading state while the deck is being prepared or if currentCard is not yet available
  if (!currentCard && !showSummary) {
    return (
        <div className="flex justify-center items-center min-h-[300px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading cards...</span>
        </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-6 p-4">
      <Progress value={progress} className="w-full max-w-md" />

      <div className="flashcard-container w-full max-w-md h-64">
        {/* Using a key ensures the card component is re-mounted (or at least reset) */}
        {/* when the card content actually changes, preventing stale flip state */}
        <Card
          key={cardKey} 
          className={`flashcard w-full h-full cursor-pointer shadow-lg rounded-lg ${isFlipped ? 'flipped' : ''}`}
          onClick={handleFlip}
          aria-live="polite"
        >
          <div className="flashcard-front">
            <span className="text-6xl font-bold">{currentCard.character}</span>
          </div>
          <div className="flashcard-back">
            <p className="text-2xl text-muted-foreground mb-2">{currentPinyin}</p>
            <ul className="text-center text-lg list-none p-0">
              {currentTranslations.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      {isFlipped && (
        <CardFooter className="flex justify-center space-x-4 mt-4">
          <Button variant="destructive" size="lg" onClick={() => handleNext(false)} className="fade-in">
            <X className="mr-2 h-5 w-5" /> Don't Know
          </Button>
          <Button variant="default" size="lg" onClick={() => handleNext(true)} className="fade-in bg-green-600 hover:bg-green-700 text-white">
            <Check className="mr-2 h-5 w-5" /> Know
          </Button>
        </CardFooter>
      )}
      {!isFlipped && (
        <div className="h-[60px] flex items-center justify-center text-muted-foreground fade-in">
           Click card to reveal
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Card {currentDeck.length > 0 ? currentDeck.findIndex(c => c.character === currentCard.character) + 1 : 0} of {currentDeck.length} (Current Round).
        Mastered: {knownWordsFromOriginalSet.size} / {totalOriginalCards}.
      </p>
       {wordsToReReview.size > 0 && currentDeck.length === wordsToReReview.size && (
        <p className="text-xs text-muted-foreground">
          ({wordsToReReview.size} card{wordsToReReview.size !== 1 ? 's' : ''} in this re-review pass)
        </p>
      )}
    </div>
  );
}

