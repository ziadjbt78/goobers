/**
 * The way in. Four tabs, one click, no URL editing — the preview pane cannot
 * take a query string, so nothing may depend on one.
 */
export type ViewId = 'world' | 'studio' | 'zoo' | 'heroes';

export const VIEWS: { id: ViewId; label: string; hint: string }[] = [
  { id: 'world', label: 'World', hint: 'Play — live meadow' },
  { id: 'studio', label: 'Studio-lite', hint: 'Shape one creature' },
  { id: 'zoo', label: 'Zoo', hint: 'Generator grid' },
  { id: 'heroes', label: 'Heroes', hint: 'The locked lineup' },
];

export function initialView(): ViewId {
  const q = new URLSearchParams(location.search);
  if (q.get('heroes') === '1') return 'heroes';
  if (q.get('zoo') === '1') return 'zoo';
  if (q.get('studio') === '1') return 'studio';
  if (q.get('world') === '1') return 'world';
  return 'world';
}

export function Menu({ view, onPick }: { view: ViewId; onPick: (v: ViewId) => void }) {
  return (
    <nav className="sh-menu" aria-label="views">
      <span className="sh-brand">GOOBERS</span>
      {VIEWS.map((v) => (
        <button
          key={v.id}
          className={`sh-tab${view === v.id ? ' sh-tab-on' : ''}`}
          title={v.hint}
          onClick={() => onPick(v.id)}
        >
          {v.label}
        </button>
      ))}
    </nav>
  );
}
