import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HeroPage } from './ui/heroes/App';
import { ZooPage } from './ui/zoo/App';
import { StudioPage } from './ui/studio/App';
import { WorldPage } from './ui/world/App';
import { Menu, initialView, type ViewId } from './ui/shell/Menu';
import './ui/heroes/hud.css';
import './ui/zoo/zoo.css';
import './ui/shell/shell.css';
import './ui/world/world.css';
import './ui/studio/studio.css';

function Shell() {
  const [view, setView] = useState<ViewId>(initialView);
  return (
    <>
      <Menu view={view} onPick={setView} />
      {view === 'world' && <WorldPage key="world" />}
      {view === 'studio' && <StudioPage key="studio" />}
      {view === 'zoo' && <ZooPage key="zoo" />}
      {view === 'heroes' && <HeroPage key="heroes" />}
    </>
  );
}

const el = document.getElementById('root');
if (el) createRoot(el).render(<Shell />);
