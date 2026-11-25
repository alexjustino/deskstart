import type { ReactNode } from 'react';

import type { ManualLanguage } from '@/domain/settings';

import type { SectionId } from '../manual/types';

import { at } from './motion';
import { Step, Window } from './parts';

/**
 * What each scene draws (1.3, ADR-035). A scene is Deskstart doing the one
 * thing its manual section is about, in a 360×200 frame, in token colours,
 * moved by the classes in `scenes.css`. Words inside a scene are few and in
 * the manual's language; the section beside it says the rest.
 */

export const SCENE_IDS = [
  'start',
  'run',
  'time',
  'where',
  'machines',
  'triggers',
  'capture',
  'sharing',
] as const satisfies readonly SectionId[];
export type SceneId = (typeof SCENE_IDS)[number];

type Words = Record<ManualLanguage, string>;
const w = (en: string, pt: string): Words => ({ en, 'pt-BR': pt });

const DRAWINGS: Record<SceneId, { label: Words; draw: (l: ManualLanguage) => ReactNode }> = {
  start: {
    label: w(
      'Home: a profile card, and Run pressed once — its steps light one after another.',
      'Home: um cartão de perfil e o Run pressionado uma vez — os passos acendem um após o outro.',
    ),
    draw: (l) => (
      <>
        <rect className="card" x="20" y="24" width="160" height="150" rx="8" />
        <text x="34" y="48">
          {l === 'en' ? 'Morning' : 'Manhã'}
        </text>
        <text className="small" x="34" y="62">
          {l === 'en' ? '4 steps' : '4 passos'}
        </text>
        <g className="pop" style={at(300)}>
          <rect className="accent" x="34" y="136" width="56" height="24" rx="5" />
          <text className="on-accent" x="62" y="152" textAnchor="middle">
            Run
          </text>
        </g>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect className="card" x="200" y={30 + i * 36} width="140" height="28" rx="5" />
            <circle
              className={`${i === 3 ? 'caution' : 'accent'} light`}
              cx="216"
              cy={44 + i * 36}
              r={5 + i}
              style={at(900 + i * 350)}
            />
            <rect className="line" x="230" y={41 + i * 36} width={70 - i * 8} height="5" rx="2" />
          </g>
        ))}
      </>
    ),
  },
  run: {
    label: w(
      'Run: each step starts in order, and the log writes a line for it before the screen shows it.',
      'Run: cada passo inicia em ordem, e o log grava uma linha para ele antes da tela mostrá-la.',
    ),
    draw: (l) => (
      <>
        <Step y={24} name="code.exe" t={300} />
        <Step y={58} name="Projects" t={1000} />
        <Step y={92} name="Standup" t={1700} />
        <rect className="layer" x="186" y="24" width="154" height="150" rx="6" />
        {[
          { text: 'Started code.exe', t: 450 },
          { text: 'Opened Projects', t: 1150 },
          { text: 'Opened Standup', t: 1850 },
        ].map((row, i) => (
          <g key={row.text} className="rise" style={at(row.t)}>
            <text className="mono" x="196" y={46 + i * 20}>
              {row.text}
            </text>
          </g>
        ))}
        <g className="rise" style={at(2500)}>
          <circle className="success" cx="200" cy="150" r="5" />
          <text className="small" x="210" y="153">
            {l === 'en' ? 'Run finished — completed' : 'Execução concluída'}
          </text>
        </g>
      </>
    ),
  },
  time: {
    label: w(
      'Time: a program is held open, closed when its time is up, and opened again for the next cycle.',
      'Tempo: um programa fica aberto, fecha quando o tempo acaba e abre de novo no próximo ciclo.',
    ),
    draw: (l) => (
      <>
        <Window
          x={30}
          y={30}
          width={150}
          height={90}
          title="notes.exe"
          className="pop"
          style={at(200)}
        />
        <rect className="layer" x="30" y="140" width="300" height="8" rx="4" />
        <rect
          className="accent grow"
          x="30"
          y="140"
          width="150"
          height="8"
          rx="4"
          style={at(600)}
        />
        <text className="small" x="30" y="166">
          {l === 'en' ? 'Hold 25 min' : 'Aberto 25 min'}
        </text>
        <g className="leave" style={at(1550)}>
          <rect className="card" x="200" y="30" width="130" height="90" rx="4" />
        </g>
        <Window
          x={200}
          y={30}
          width={130}
          height={90}
          title={l === 'en' ? 'cycle 2' : 'ciclo 2'}
          className="pop"
          style={at(1900)}
        />
        <rect
          className="caution grow"
          x="180"
          y="140"
          width="150"
          height="8"
          rx="4"
          style={at(2100)}
        />
      </>
    ),
  },
  where: {
    label: w(
      'Where: the window opens, then glides to its screen and its place, at the size asked for.',
      'Onde: a janela abre e desliza para a sua tela e o seu lugar, no tamanho pedido.',
    ),
    draw: () => (
      <>
        <rect className="card" x="14" y="30" width="160" height="110" rx="6" />
        <rect className="card" x="186" y="30" width="160" height="110" rx="6" />
        <text className="small" x="20" y="154">
          1
        </text>
        <text className="small" x="192" y="154">
          2
        </text>
        <rect
          className="accent-soft fade"
          x="196"
          y="40"
          width="140"
          height="90"
          rx="4"
          style={at(200)}
        />
        <Window
          x={196}
          y={40}
          width={140}
          height={90}
          title="code.exe"
          className="glide"
          style={at(500, -170, 20)}
        />
      </>
    ),
  },
  machines: {
    label: w(
      'Machines: the password is asked before the run and never kept; then the machine’s console opens.',
      'Máquinas: a senha é pedida antes do run e nunca guardada; então o console da máquina abre.',
    ),
    draw: (l) => (
      <>
        <rect className="card" x="20" y="30" width="150" height="80" rx="6" />
        <text x="32" y="50">
          vault
        </text>
        <rect className="layer" x="32" y="62" width="126" height="20" rx="4" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <circle
            key={i}
            className="ink pop"
            cx={44 + i * 12}
            cy="72"
            r="3"
            style={at(300 + i * 120)}
          />
        ))}
        <g className="rise" style={at(1100)}>
          <text className="small" x="32" y="100">
            {l === 'en'
              ? 'used for this run, never stored'
              : 'usada nesta execução, nunca guardada'}
          </text>
        </g>
        <Window
          x={190}
          y={40}
          width={150}
          height={110}
          title="VMware — vault"
          className="pop"
          style={at(1600)}
        />
        <rect
          className="accent grow"
          x="198"
          y="138"
          width="134"
          height="4"
          rx="2"
          style={at(1900)}
        />
      </>
    ),
  },
  triggers: {
    label: w(
      'Triggers: at 07:30 the Task Scheduler starts the profile, with nobody pressing anything.',
      'Gatilhos: às 07:30 o Agendador de Tarefas inicia o perfil, sem ninguém pressionar nada.',
    ),
    draw: (l) => (
      <>
        <circle className="card" cx="80" cy="96" r="58" />
        <circle className="stroke" cx="80" cy="96" r="58" strokeWidth="2" />
        <rect className="ink" x="78" y="54" width="4" height="44" rx="2" />
        <g className="sweep" style={{ ...at(100), transformOrigin: '80px 96px' }}>
          <rect className="accent" x="79" y="96" width="2" height="34" rx="1" />
        </g>
        <text className="small" x="58" y="176">
          07:30
        </text>
        <g className="pop" style={at(900)}>
          <rect className="accent-soft" x="170" y="40" width="170" height="34" rx="6" />
          <text x="184" y="61">
            {l === 'en' ? 'Scheduled — Morning' : 'Agendado — Manhã'}
          </text>
        </g>
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            className={`${i === 2 ? 'caution' : 'accent'} light`}
            cx={196 + i * 34}
            cy="110"
            r={7 + i * 2}
            style={at(1400 + i * 300)}
          />
        ))}
      </>
    ),
  },
  capture: {
    label: w(
      'Capture: the windows open now are ticked, and become a profile that puts each one back.',
      'Captura: as janelas abertas são marcadas e viram um perfil que põe cada uma de volta.',
    ),
    draw: (l) => (
      <>
        <Window x={20} y={24} width={110} height={60} title="Projects" />
        <Window x={40} y={100} width={110} height={70} title="Claude" />
        <Window x={140} y={40} width={70} height={50} title="Calculator" />
        {[
          { x: 118, y: 30 },
          { x: 138, y: 106 },
          { x: 198, y: 46 },
        ].map((tick, i) => (
          <g key={i} className="pop" style={at(300 + i * 250)}>
            <circle className="accent" cx={tick.x} cy={tick.y} r="7" />
            <path
              d="M-3 0 L-1 2.5 L3.5 -2.5"
              transform={`translate(${tick.x} ${tick.y})`}
              className="stroke"
              style={{ stroke: 'var(--color-fg-on-accent)' }}
              strokeWidth="1.6"
            />
          </g>
        ))}
        <g className="glide" style={at(1300, -120, 0)}>
          <rect className="card" x="236" y="40" width="110" height="120" rx="6" />
          <text x="246" y="58">
            {l === 'en' ? 'My desk' : 'Minha mesa'}
          </text>
          {['Projects', 'Claude', 'Calculator'].map((name, i) => (
            <text key={name} className="small" x="246" y={80 + i * 18}>
              {name}
            </text>
          ))}
        </g>
      </>
    ),
  },
  sharing: {
    label: w(
      'Sharing: an imported profile runs nothing until each step has been read and accepted.',
      'Compartilhar: um perfil importado não roda nada até cada passo ser lido e aceito.',
    ),
    draw: (l) => (
      <>
        <g className="drop" style={at(100)}>
          <rect className="card" x="24" y="40" width="70" height="90" rx="6" />
          <text className="small" x="34" y="62">
            .json
          </text>
          <rect className="line" x="34" y="72" width="50" height="4" rx="2" />
          <rect className="line" x="34" y="82" width="40" height="4" rx="2" />
        </g>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <rect className="card" x="120" y={36 + i * 40} width="220" height="30" rx="5" />
            <rect className="line" x="132" y={48 + i * 40} width={90 - i * 12} height="5" rx="2" />
            <g className="pop" style={at(800 + i * 450)}>
              <rect className="accent" x="282" y={41 + i * 40} width="50" height="20" rx="4" />
              <text className="on-accent" x="307" y={55 + i * 40} textAnchor="middle">
                {l === 'en' ? 'Accept' : 'Aceitar'}
              </text>
            </g>
          </g>
        ))}
        <g className="rise" style={at(2300)}>
          <circle className="success" cx="128" cy="172" r="5" />
          <text className="small" x="138" y="175">
            {l === 'en' ? 'Reviewed — Run is offered' : 'Revisado — o Run fica disponível'}
          </text>
        </g>
      </>
    ),
  },
};

export function sceneOf(id: string): (typeof DRAWINGS)[SceneId] | undefined {
  return (SCENE_IDS as readonly string[]).includes(id) ? DRAWINGS[id as SceneId] : undefined;
}
