import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameShellActions, GameShellView, StartAction } from '../src/modules/ui/game-shell/types';

// tsx compiles this suite's JSX with the classic runtime, which reads a global React.
(globalThis as { React?: typeof React }).React = React;
const { default: GameShellStartOverlay } = await import('../src/modules/ui/game-shell/GameShellStartOverlay');

const noop = (): void => undefined;
const actions: GameShellActions = {
  start: noop, pause: noop, resume: noop, restart: noop, retry: noop, setDimension: noop,
  setHeld: noop, press: noop, setSettings: noop,
  playOnline: async () => ({}), leaveOnline: noop,
};
const startActions: StartAction[] = [{ id: 'quick-match', label: 'Quick match', run: async () => undefined }];
const view = (online?: GameShellView['online']): GameShellView => ({
  status: 'ready', dimension: '2d', score: 0, bestScore: 0, secondsRemaining: 60, objective: 'Collect stars.',
  canPickDimension: true, ...(online ? { online } : {}),
});
const render = (online?: GameShellView['online']): string =>
  renderToStaticMarkup(<GameShellStartOverlay view={view(online)} actions={actions} startActions={startActions} />);

test('a pending room shows Connecting and Leave, with no Play or start buttons', () => {
  const html = render({ state: 'connecting' });
  assert.match(html, /Connecting/);
  assert.match(html, />Leave</);
  assert.doesNotMatch(html, />Play</);
  assert.doesNotMatch(html, /Quick match/);
  assert.doesNotMatch(html, /Switch to 3D/);
});

test('once the request is left, Play and the start buttons are back and usable', () => {
  const html = render();
  assert.match(html, />Play</);
  assert.match(html, /Quick match/);
  assert.doesNotMatch(html, /disabled=""/);
});

test('a closed connection explains itself and offers Play', () => {
  const html = render({ state: 'ended', message: 'The connection to your friend closed.' });
  assert.match(html, /The connection to your friend closed\./);
  assert.match(html, />Play</);
});

test('a room request in flight shows Connecting even while the last round still reads ended', async () => {
  const { shellOnlineView } = await import('../src/core/onlineView');
  const ended = { state: 'ended' as const, message: 'The connection to your friend closed.' };
  assert.deepEqual(shellOnlineView(ended, true), { state: 'connecting' });
  assert.equal(shellOnlineView(ended, false), ended);
  assert.equal(shellOnlineView(undefined, false), undefined);
  const html = renderToStaticMarkup(
    <GameShellStartOverlay view={view(shellOnlineView(ended, true))} actions={actions} startActions={startActions} />,
  );
  assert.match(html, />Leave</);
  assert.doesNotMatch(html, /Quick match/);
});
