import { useEffect, useState } from 'react';

type Tab = 'library' | 'playlist';
interface Screen {
  tab: Tab;
  selected: string | null;
}
function restoredScreen(): Screen {
  const saved = localStorage.getItem('luma.tab');
  return {
    tab: saved === 'playlist' || saved === 'schedule' ? 'playlist' : 'library',
    selected: localStorage.getItem('luma.preview'),
  };
}
// Older history entries may name a 'live' tab (now in the Library) or a 'schedule' tab (now
// part of each playlist).
function knownScreen(screen: { tab: string; selected: string | null }): Screen {
  if (screen.tab === 'playlist' || screen.tab === 'schedule') return { ...screen, tab: 'playlist' };
  return { ...screen, tab: 'library' };
}
export function useNavigation() {
  const [screen, setScreen] = useState<Screen>(() =>
    history.state?.luma ? knownScreen(history.state.luma as Screen) : restoredScreen(),
  );
  useEffect(() => {
    if (!history.state?.luma) {
      history.replaceState({ luma: { tab: 'library', selected: null } }, '');
      if (screen.tab !== 'library') history.pushState({ luma: { ...screen, selected: null } }, '');
      if (screen.selected) history.pushState({ luma: screen }, '');
    }
    function back(event: PopStateEvent) {
      if (event.state?.luma) setScreen(knownScreen(event.state.luma as Screen));
    }
    window.addEventListener('popstate', back);
    return () => window.removeEventListener('popstate', back);
  }, []);
  useEffect(() => {
    localStorage.setItem('luma.tab', screen.tab);
    if (screen.selected) localStorage.setItem('luma.preview', screen.selected);
    else localStorage.removeItem('luma.preview');
  }, [screen]);
  function navigate(next: Screen) {
    if (next.tab === screen.tab && next.selected === screen.selected) return;
    history.pushState({ luma: next }, '');
    setScreen(next);
  }
  return {
    ...screen,
    setTab: (tab: Tab) => navigate({ tab, selected: null }),
    setSelected: (selected: string | null) => {
      if (selected === null && screen.selected) history.back();
      else navigate({ ...screen, selected });
    },
  };
}
