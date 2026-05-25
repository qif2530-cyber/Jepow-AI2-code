import { useState, useEffect } from 'react';

export function useCtrlPressed() {
  const [isPressed, setIsPressed] = useState(false);

  useEffect(() => {
    let lastState = false;

    const updateCtrlState = (pressed: boolean) => {
      if (pressed !== lastState) {
        lastState = pressed;
        setIsPressed(pressed);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const pressed = e.ctrlKey || e.metaKey || e.key === 'Control' || e.key === 'Meta';
      updateCtrlState(pressed);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const pressed = e.ctrlKey || e.metaKey;
      updateCtrlState(pressed);
    };

    const handleMouseEvent = (e: MouseEvent) => {
      const pressed = e.ctrlKey || e.metaKey;
      updateCtrlState(pressed);
    };

    const handleBlur = () => {
      updateCtrlState(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    window.addEventListener('mousedown', handleMouseEvent, { capture: true });
    window.addEventListener('mouseup', handleMouseEvent, { capture: true });
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
      window.removeEventListener('mousedown', handleMouseEvent, { capture: true });
      window.removeEventListener('mouseup', handleMouseEvent, { capture: true });
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  return isPressed;
}
