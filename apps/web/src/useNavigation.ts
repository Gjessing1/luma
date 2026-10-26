import { useEffect, useState } from 'react';

type Tab = 'library' | 'playlist' | 'schedule' | 'live';
interface Screen {
  tab: Tab;
  selected: string | null;
}
function restoredScreen(): Screen {
  const saved = localStorage.getItem('luma.tab');
  return {
    tab: saved === 'playlist' || saved === 'schedule' || saved === 'live' ? saved : 'library',
    selected: localStorage.getItem('luma.preview'),
  };
}
export function useNavigation() {
  const [screen, setScreen] = useState<Screen>(() => history.state?.luma ?? restoredScreen());
  useEffect(() => {
    if (!history.state?.luma) {
      history.replaceState({ luma: { tab: 'library', selected: null } }, '');
      if (screen.tab !== 'library') history.pushState({ luma: { ...screen, selected: null } }, '');
      if (screen.selected) history.pushState({ luma: screen }, '');
    }
    function back(event: PopStateEvent) {
      if (event.state?.luma) setScreen(event.state.luma as Screen);
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
