
import React, { useState, useMemo, useCallback } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type LookupWordOutput } from '@/ai/schemas/lookup-word-schemas';
import { Loader2, X } from 'lucide-react'; // Import X icon
import { type WordInfo } from '@/data/words';
import { Button } from '@/components/ui/button'; // Import Button

interface ChapterTextRendererProps {
  content: string;
  interactiveWords: WordInfo[];
  onWordClick: (word: string) => void;
  isLookingUp: boolean;
  currentLookupWord: string | null;
  lookupInfo: (LookupWordOutput & { word: string }) | null;
  difficultWords: Set<string>;
  onPopoverClose: () => void;
}

interface TextSegment {
  type: 'text' | 'word';
  value: string;
}

// Helper function to perform segmentation
function segmentTextIntoParts(
  text: string,
  interactiveWordsData: WordInfo[]
): TextSegment[] {
  console.log("interactiveWordsData received by segmentTextIntoParts:", interactiveWordsData);

  // Log character codes for the text "传统" and its version in interactiveWordsData if present
  const testWord = "传统";
  const textIndexOfTestWord = text.indexOf(testWord);

  if (textIndexOfTestWord !== -1) {
    console.log(`Character codes in text content for "${testWord}" at index ${textIndexOfTestWord}:`);
    for (let i = 0; i < testWord.length; i++) {
      console.log(`  '${testWord[i]}': ${text.charCodeAt(textIndexOfTestWord + i)}`);
    }
  } else {
     console.log(`"${testWord}" not found in text content.`);
  }

  const wordInfoForTestWord = interactiveWordsData.find(item => item && item.word === testWord);
  if (wordInfoForTestWord) {
    console.log(`Character codes in interactiveWordsData for "${testWord}":`);
    for (let i = 0; i < testWord.length; i++) {
      console.log(`  '${testWord[i]}': ${wordInfoForTestWord.word.charCodeAt(i)}`);
    }
  } else {
     console.log(`"${testWord}" not found in interactiveWordsData.`);
  }


  if (!text) return [];
  
  const segments: TextSegment[] = [];
  // Filter out any WordInfo objects where `word` might be undefined or null, or empty string
  const validWords = interactiveWordsData.filter(iw => iw && typeof iw.word === 'string' && iw.word.length > 0);

  if (validWords.length === 0) {
    // If no interactive words, split by newline to preserve them as <br>
     text.split(/(\n)/).forEach(part => {
        if (part) { // Ensure no empty strings are added
            segments.push({ type: 'text', value: part });
        }
    });
    return segments;
  }

  // Sort words by length descending to match longer words first.
  const sortedWords = validWords.map(iw => iw.word).sort((a, b) => {
    if (a && b) {
      return b.length - a.length;
    }
    if (a) return -1;
    if (b) return 1;
    return 0;
  });
  
  const escapedWords = sortedWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  
  // Revised Regex Pattern:
  // 1. Interactive words
  // 2. Newline
  // 3. SINGLE non-newline character as fallback
  const pattern = new RegExp(`(${escapedWords.join('|')})|(\\n)|([^\\n])`, 'gu');
  console.log('Generated RegExp pattern:', pattern.source);


  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    // Log all matches to see how text is being tokenized
    console.log('Match Found:', {
      fullMatch_match0: match[0],
      interactiveWord_match1: match[1], 
      newline_match2: match[2],     
      singleCharText_match3: match[3], 
      index: match.index,
      pattern_lastIndex: pattern.lastIndex 
    });

    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.substring(lastIndex, match.index) });
    }

    const interactiveWordMatch = match[1];
    const newlineMatch = match[2];
    const singleCharTextMatch = match[3]; 

    if (interactiveWordMatch) {
      segments.push({ type: 'word', value: interactiveWordMatch });
    } else if (newlineMatch) {
      segments.push({ type: 'text', value: newlineMatch }); 
    } else if (singleCharTextMatch) {
      segments.push({ type: 'text', value: singleCharTextMatch });
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.substring(lastIndex) });
  }
  console.log("Final segments:", segments); // Log final segments for inspection
  return segments;
}


const ChapterTextRenderer = React.memo(function ChapterTextRenderer({
  content,
  interactiveWords,
  onWordClick,
  isLookingUp,
  currentLookupWord,
  lookupInfo,
  difficultWords,
  onPopoverClose,
}: ChapterTextRendererProps) {
  const [popoverOpenStates, setPopoverOpenStates] = useState<Record<string, boolean>>({});
  console.log('ChapterTextRenderer rendering/re-rendering. Props:', { interactiveWordsLength: interactiveWords.length, isLookingUp, currentLookupWord, lookupInfoWord: lookupInfo ? lookupInfo.word : null, difficultWordsSize: difficultWords.size });


  const handlePopoverOpenChange = useCallback((word: string, open: boolean) => {
    console.log(`Popover for "${word}" changed state to: ${open}`);
    setPopoverOpenStates(prev => ({ ...prev, [word]: open }));
    if (!open) {
        onPopoverClose(); 
    }
  }, [onPopoverClose]); 

  const handleWordSpanClick = useCallback((clickedWordValue: string) => { 
     console.log(`Word clicked: "${clickedWordValue}" from ChapterTextRenderer`);
     onWordClick(clickedWordValue);
     // When a word is clicked, explicitly set its popover state to true
     // This ensures the popover opens even if parent state updates are batched/delayed
     setPopoverOpenStates(prev => ({ ...prev, [clickedWordValue]: true }));
  }, [onWordClick]);

  const textSegments = useMemo(() => {
    console.log("Recalculating text segments in useMemo...");
    return segmentTextIntoParts(content, interactiveWords);
  }, [content, interactiveWords]); 


  return (
    <div className="text-lg leading-relaxed font-serif text-foreground/90" lang="zh">
      {textSegments.map((segment, index) => {
        if (segment.type === 'word') {
          const wordValue = segment.value;
          const isCurrentWordLoading = isLookingUp && currentLookupWord === wordValue;
          // Determine if popover should be open:
          // 1. If it's the current word being looked up (isCurrentWordLoading)
          // 2. OR if we have lookupInfo for this word AND it's the currentLookupWord
          // 3. OR if local popoverOpenStates for this word is true (user clicked it or 'X' on another popover)
          const isProgrammaticallyOpen = !!(lookupInfo && lookupInfo.word === wordValue && currentLookupWord === wordValue);
          const isOpen = popoverOpenStates[wordValue] || isCurrentWordLoading || isProgrammaticallyOpen;
          
          console.log(`Rendering word: "${wordValue}", isLoading: ${isCurrentWordLoading}, hasData: ${isProgrammaticallyOpen}, localOpenState: ${popoverOpenStates[wordValue]}, finalIsOpen: ${isOpen}`);
          
          return (
            <Popover 
                key={`word-${index}-${wordValue}`} 
                open={isOpen} 
                onOpenChange={(open) => handlePopoverOpenChange(wordValue, open)}
            >
              <PopoverTrigger asChild>
                <span
                  onClick={() => handleWordSpanClick(wordValue)}
                  className={`cursor-pointer hover:text-primary transition-colors duration-200 ${
                    difficultWords.has(wordValue) ? 'text-destructive underline decoration-dotted' : ''
                  } ${isCurrentWordLoading ? 'text-primary/70 animate-pulse' : ''} ${isProgrammaticallyOpen && !isLookingUp ? 'text-primary font-semibold' : ''} `}
                  aria-describedby={isOpen ? `popover-content-${index}-${wordValue}` : undefined}
                >
                  {wordValue}
                </span>
              </PopoverTrigger>
              {isOpen && ( 
                  <PopoverContent
                    id={`popover-content-${index}-${wordValue}`}
                    align="center"
                    side="top"
                    className="w-auto p-4 fade-in shadow-lg rounded-md border border-border bg-popover relative" // Added relative for positioning close button
                    onOpenAutoFocus={(e) => e.preventDefault()}
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => handlePopoverOpenChange(wordValue, false)} // Explicitly close this popover
                      aria-label="Close popover"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    {isCurrentWordLoading ? (
                      <div className="flex items-center justify-center text-muted-foreground pt-2">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        <span>Looking up...</span>
                      </div>
                    ) : lookupInfo && lookupInfo.word === wordValue ? ( // Ensure lookupInfo is for THIS word
                      <div className="space-y-1 text-center pt-2">
                        <p className="text-xl font-semibold">{lookupInfo.word}</p>
                        <p className="text-base text-muted-foreground">{lookupInfo.pinyin}</p>
                        <p className="text-sm">{lookupInfo.translation}</p>
                      </div>
                    ) : (
                       <div className="text-center text-muted-foreground text-sm italic pt-2">
                          Click to lookup...
                       </div>
                    )}
                  </PopoverContent>
               )}
            </Popover>
          );
        } else {
           return segment.value.split(/(\n)/).map((part, partIndex) => 
            part === '\n' ? <br key={`br-${index}-${partIndex}`} /> : <span key={`text-${index}-${partIndex}-${segment.type}`}>{part}</span>
          );
        }
      })}
    </div>
  );
});

export default ChapterTextRenderer;
