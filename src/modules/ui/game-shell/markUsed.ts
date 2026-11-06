/** Records that game code reached this module. Studio looks for the id in the built game. */
export function markUsed(): void {
  ((globalThis as { __rundotModules?: Set<string> }).__rundotModules ??= new Set()).add('rundot-module:ui/game-shell')
}
