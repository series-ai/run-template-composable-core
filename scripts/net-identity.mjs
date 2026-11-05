// The game's Syncplay identity, bound to the simulation sources and the installed Syncplay version.
import { readFileSync } from 'node:fs';
import { deriveCustomRuntimeIdentity, kinetixRuntimeModuleManifest } from '@series-inc/rundot-syncplay/core';

const root = new URL('..', import.meta.url);
const runtimeModules = [
  'modules/runtime/game-application/adapter2d.ts',
  'modules/runtime/game-application/checkpoint.ts',
  'modules/runtime/game-application/journal.ts',
  'modules/runtime/game-application/netRuntime.ts',
  'modules/runtime/game-application/scene.ts',
  'modules/runtime/game-application/types.ts',
];

export function deriveNetIdentity() {
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  return deriveCustomRuntimeIdentity({
    tickRate: 60,
    inputSchema: { id: 'modules-template-coop-input/v1' },
    stateSchema: { id: 'modules-template-coop-state/v1' },
    deterministicVersion: `modules-template-coop@1+syncplay${pkg.dependencies['@series-inc/rundot-syncplay']}`,
    runtimeModules: kinetixRuntimeModuleManifest(new URL('src', root).pathname, runtimeModules),
  });
}
