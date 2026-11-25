import { ArrowCounterclockwise20Regular } from '@fluentui/react-icons';
import { useEffect, useRef, useState } from 'react';

import type { ManualLanguage } from '@/domain/settings';
import { IconButton } from '@/ui/IconButton';

import { sceneOf } from './drawings';
import './scenes.css';

/**
 * One scene of the manual (1.3, ADR-035): Deskstart doing what the section
 * beside it says. It waits until half of it is in view, plays once, and plays
 * again on Replay — never by itself, never in a loop. Under reduced motion it
 * is shown finished (`scenes.css`). A section without a scene shows nothing.
 */
export function HelpScene({ id, language }: { id: string; language: ManualLanguage }) {
  const holder = useRef<HTMLElement>(null);
  // Without a way to know it is in view, a scene simply plays.
  const [state, setState] = useState<'idle' | 'playing'>(() =>
    typeof IntersectionObserver === 'undefined' ? 'playing' : 'idle',
  );
  // A new take is a new drawing: its moves start again from their first frame.
  const [take, setTake] = useState(0);
  const scene = sceneOf(id);

  useEffect(() => {
    const element = holder.current;
    if (element === null || typeof IntersectionObserver === 'undefined') return;
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setState('playing');
          watcher.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [id]);

  if (scene === undefined) return null;
  const label = scene.label[language];

  return (
    <figure
      ref={holder}
      className="ds-scene relative m-0 overflow-hidden rounded-lg border border-stroke-subtle bg-layer p-3"
      data-state={state}
      data-scene={id}
      data-take={take}
    >
      <svg key={`${id}-${take}-${language}`} viewBox="0 0 360 200" role="img" aria-label={label}>
        {scene.draw(language)}
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
      <div className="absolute top-2 right-2">
        <IconButton
          label={language === 'pt-BR' ? 'Repetir a animação' : 'Replay'}
          icon={<ArrowCounterclockwise20Regular />}
          onClick={() => {
            setTake((count) => count + 1);
            setState('playing');
          }}
        />
      </div>
    </figure>
  );
}
