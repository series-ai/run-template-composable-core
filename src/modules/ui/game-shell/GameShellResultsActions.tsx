import { useEffect, useRef, useState } from 'react'
import SkinButton from './SkinButton'
import { isSkinIconName } from './SkinIcon'
import type { GameShellActions, GameShellView, ResultsAction } from './types'

export interface GameShellResultsActionsProps {
  open: boolean
  resultsActions: ResultsAction[]
  actions: GameShellActions
  view: GameShellView
}

/** Draws the buttons other modules add to the results screen. Each results screen starts fresh. */
export function GameShellResultsActions({
  open,
  resultsActions,
  actions,
  view,
}: GameShellResultsActionsProps) {
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  const [claimed, setClaimed] = useState<ReadonlySet<string>>(new Set())
  const [notices, setNotices] = useState<Readonly<Record<string, string>>>({})
  const visitRef = useRef(0)

  useEffect(() => {
    if (open) return
    visitRef.current += 1
    setBusy(new Set())
    setClaimed(new Set())
    setNotices({})
  }, [open])

  const run = async (action: ResultsAction): Promise<void> => {
    const visit = visitRef.current
    const current = (): boolean => visitRef.current === visit
    const addScore = actions.addScore
    setBusy((ids) => new Set(ids).add(action.id))
    let notice: string | undefined
    let done = false
    try {
      const outcome = await action.run({
        addScore: addScore && ((points: number) => { if (current()) addScore(points, action.id) }),
      })
      notice = outcome?.notice
      done = outcome?.claimed === true
    } catch (error) {
      console.warn(`Results action ${action.id} failed.`, error)
      notice = 'Something went wrong. Please try again.'
    }
    if (!current()) return
    setBusy((ids) => {
      const next = new Set(ids)
      next.delete(action.id)
      return next
    })
    if (done) setClaimed((ids) => new Set(ids).add(action.id))
    setNotices((all) => {
      const next = { ...all }
      if (notice) next[action.id] = notice
      else delete next[action.id]
      return next
    })
  }

  return (
    <>
      {resultsActions.map((action) => (
        <div
          key={action.id}
          style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}
        >
          {claimed.has(action.id) || view.rewardsClaimed?.includes(action.id) ? null : (
            <SkinButton
              disabled={busy.has(action.id)}
              iconName={isSkinIconName(action.icon) ? action.icon : undefined}
              onClick={() => { void run(action) }}
              size="default"
              variant="secondary"
            >
              {action.label}
            </SkinButton>
          )}
          {notices[action.id] ? (
            <div className="game-shell__notice-banner" role="status">
              <span>{notices[action.id]}</span>
            </div>
          ) : null}
        </div>
      ))}
    </>
  )
}

export default GameShellResultsActions
