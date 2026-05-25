import { useState, useEffect, useCallback, useRef } from 'react';

export function useHistory<T>(currentState: T, delay: number = 500) {
  const [historyState, setHistoryState] = useState<{ history: T[], currentIndex: number }>({
    history: [],
    currentIndex: -1
  });
  const isUndoingRef = useRef(false);

  useEffect(() => {
    if (historyState.history.length === 0) {
      setHistoryState({
        history: [currentState],
        currentIndex: 0
      });
    }
  }, []);

  useEffect(() => {
    if (isUndoingRef.current) {
      isUndoingRef.current = false;
      return;
    }

    const timeout = setTimeout(() => {
      setHistoryState((prev) => {
        if (prev.history.length === 0) {
          return { history: [currentState], currentIndex: 0 };
        }
        
        const lastState = prev.history[prev.currentIndex];
        if (lastState && JSON.stringify(lastState) === JSON.stringify(currentState)) {
          return prev;
        }

        const newHistory = prev.history.slice(0, prev.currentIndex + 1);
        newHistory.push(currentState);
        
        if (newHistory.length > 20) {
          newHistory.shift();
          return { history: newHistory, currentIndex: 19 };
        }
        
        return { history: newHistory, currentIndex: newHistory.length - 1 };
      });
    }, delay);

    return () => clearTimeout(timeout);
  }, [currentState, delay]);

  const undo = useCallback(() => {
    let previousState: T | null = null;
    setHistoryState((prev) => {
      if (prev.currentIndex > 0) {
        isUndoingRef.current = true;
        const newIndex = prev.currentIndex - 1;
        previousState = prev.history[newIndex];
        return { ...prev, currentIndex: newIndex };
      }
      return prev;
    });
    return previousState;
  }, []);

  const redo = useCallback(() => {
    let nextState: T | null = null;
    setHistoryState((prev) => {
      if (prev.currentIndex < prev.history.length - 1) {
        isUndoingRef.current = true;
        const newIndex = prev.currentIndex + 1;
        nextState = prev.history[newIndex];
        return { ...prev, currentIndex: newIndex };
      }
      return prev;
    });
    return nextState;
  }, []);

  return { 
    undo, 
    redo, 
    canUndo: historyState.currentIndex > 0, 
    canRedo: historyState.currentIndex < historyState.history.length - 1 
  };
}
