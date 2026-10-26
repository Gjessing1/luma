import { useEffect, useState } from 'react';
import { checkAppUpdate, downloadAppUpdate, type PublishedApp } from './app-update';

// Shown only inside the Android app, and only when the server publishes a newer APK.
export function AppUpdateNotice() {
  const [update, setUpdate] = useState<PublishedApp | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(function checkForUpdates() {
    function check() {
      if (!document.hidden)
        checkAppUpdate()
          .then(setUpdate)
          .catch(() => {});
    }
    check();
    const timer = window.setInterval(check, 6 * 60 * 60 * 1000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  if (!update) {
    return null;
  }

  function download(published: PublishedApp) {
    setBusy(true);
    setStatus('Downloading…');
    downloadAppUpdate(published)
      .then(() => setStatus('Open the finished download to install it.'))
      .catch((err: unknown) => setStatus(`Download failed: ${String(err)}`))
      .finally(() => setBusy(false));
  }

  return (
    <aside className="app-update" role="status">
      <span>Luma {update.versionName} is available for Android.</span>
      <button type="button" onClick={() => download(update)} disabled={busy}>
        Download
      </button>
      {status !== '' && <span>{status}</span>}
    </aside>
  );
}
