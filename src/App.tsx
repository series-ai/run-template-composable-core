import { useEffect, useSyncExternalStore } from 'react';
import GameShell from './modules/ui/game-shell/GameShell';
import GameViewport from './viewport/GameViewport';
import type { StarterApplication } from './core/StarterApplication';
import './modules/ui/game-shell/game-shell.css';
const touchControls = { buttons: [{ id: 'jump', label: 'Jump' }] };

export default function App({ application }: { application: StarterApplication }) {
  const view = useSyncExternalStore(application.subscribe, application.getView);
  useEffect(() => {
    if (view.status === 'running') document.querySelector('canvas')?.focus({ preventScroll: true });
  }, [view.status]);
  return <GameShell view={view} actions={application.actions} touchControls={touchControls}>
    {application.game && <GameViewport key={view.dimension} application={application} />}
  </GameShell>;
}
