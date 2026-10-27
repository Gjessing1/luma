import { useEffect, useRef } from 'react';

// A sheet takes a history entry so the Android Back action closes it instead of leaving the
// page (A11). Returns the close to call from buttons, which consumes that entry.
export function useBackClose(onClose: () => void): () => void {
  const closed = useRef(false);
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    // StrictMode mounts twice in development; one entry is enough.
    if (!history.state?.sheet) history.pushState({ ...history.state, sheet: true }, '');
    function back() {
      if (closed.current) return;
      closed.current = true;
      latest.current();
    }
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  return function close() {
    if (!closed.current && history.state?.sheet) history.back();
    else if (!closed.current) {
      closed.current = true;
      latest.current();
    }
  };
}
