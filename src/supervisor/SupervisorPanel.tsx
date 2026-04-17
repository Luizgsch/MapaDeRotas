import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Ban,
  CircleDot,
  MapPinned,
  Route,
  Shield,
  Trash2,
} from 'lucide-react'

export type SupervisorPanelProps = {
  supervisorMode: boolean
  onSupervisorModeChange: (enabled: boolean) => void
  blockedCount: number
  onClearBlocks: () => void
  hasOrigin: boolean
  hasDestination: boolean
  onClearRoute: () => void
  routingHint: string | null
}

export function SupervisorPanel({
  supervisorMode,
  onSupervisorModeChange,
  blockedCount,
  onClearBlocks,
  hasOrigin,
  hasDestination,
  onClearRoute,
  routingHint,
}: SupervisorPanelProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 480, damping: 32 }}
      className="rounded-lg border border-cyan-500/30 bg-slate-900/60 p-1.5 shadow-[0_0_24px_rgba(6,182,212,0.08)] backdrop-blur-md md:p-2"
    >
      <div className="mb-1.5 flex items-center justify-between gap-1.5 border-b border-cyan-500/15 pb-1.5 md:mb-2 md:gap-2 md:pb-2">
        <div className="flex min-w-0 items-center gap-1 md:gap-1.5">
          <Shield className="size-3 shrink-0 text-cyan-400/90 md:size-3.5" aria-hidden />
          <h2 className="truncate text-[10px] font-semibold uppercase tracking-wide text-neutral-400 md:text-sm">
            Supervisor
          </h2>
        </div>
        <span
          className={
            supervisorMode
              ? 'inline-flex shrink-0 items-center gap-0.5 rounded border border-rose-500/40 bg-rose-950/50 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-rose-200/90 md:px-1.5 md:py-0.5 md:text-[10px]'
              : 'inline-flex shrink-0 items-center gap-0.5 rounded border border-emerald-500/35 bg-emerald-950/40 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-emerald-200/85 md:px-1.5 md:py-0.5 md:text-[10px]'
          }
        >
          {supervisorMode ? (
            <>
              <Ban className="size-2 md:size-2.5" aria-hidden />
              <span className="max-md:hidden">Bloqueio</span>
              <span className="md:hidden">Blq.</span>
            </>
          ) : (
            <>
              <Route className="size-2 md:size-2.5" aria-hidden />
              Rota
            </>
          )}
        </span>
      </div>

      <div className="space-y-0 max-md:-mt-0.5 md:space-y-0.5">
        <p className="hidden px-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 md:block">
          Monitoramento
        </p>
        <label className="flex cursor-pointer items-center justify-between gap-1.5 rounded-md px-0.5 py-0.5 hover:bg-white/5 md:gap-2 md:px-1 md:py-1">
          <span className="flex min-w-0 flex-col gap-0 leading-tight text-neutral-400 max-md:text-[10px] md:flex-row md:items-center md:gap-1.5 md:text-xs">
            <span className="hidden text-neutral-500 md:inline">Via</span>
            <span className="truncate max-md:font-medium">
              <span className="md:hidden">Bloquear via ao tocar</span>
              <span className="max-md:hidden">Bloquear trecho ao clicar</span>
            </span>
          </span>
          <span className="inline-flex shrink-0 scale-[0.82] items-center gap-2 md:scale-90">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={supervisorMode}
              onChange={(e) => onSupervisorModeChange(e.target.checked)}
            />
            <span
              className="relative inline-block h-4 w-[1.85rem] rounded-full bg-slate-800/90 ring-1 ring-white/10 transition peer-checked:bg-cyan-600/40 peer-checked:ring-cyan-400/35 after:absolute after:left-[2px] after:top-1/2 after:h-3 after:w-3 after:-translate-y-1/2 after:rounded-full after:bg-neutral-400 after:transition-transform after:content-[''] peer-checked:after:translate-x-[0.85rem] peer-checked:after:bg-cyan-200"
              aria-hidden
            />
          </span>
        </label>
      </div>

      <div className="my-1 h-px bg-gradient-to-r from-transparent via-cyan-500/25 to-transparent md:my-2" />

      <div className="space-y-0 md:space-y-1">
        <p className="hidden px-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 md:block">
          Bloqueios
        </p>
        <div className="flex items-center justify-between gap-1 px-0.5 py-0 md:gap-2 md:px-1 md:py-0.5">
          <span className="flex items-center gap-0.5 text-[10px] text-neutral-400 md:gap-1 md:text-xs">
            <Ban className="size-2.5 shrink-0 text-rose-400/70 md:size-3" aria-hidden />
            <span className="max-md:hidden">Ativos</span>
            <strong className="font-semibold text-cyan-200/90">{blockedCount}</strong>
          </span>
          <button
            type="button"
            disabled={blockedCount === 0}
            onClick={onClearBlocks}
            aria-label="Limpar bloqueios"
            className="inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1 py-px text-[10px] font-medium text-neutral-300 transition hover:border-cyan-500/35 hover:bg-cyan-500/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-35 md:px-1.5 md:py-0.5"
          >
            <Trash2 className="size-2.5 md:size-3" aria-hidden />
            <span className="max-md:hidden">Limpar</span>
          </button>
        </div>
      </div>

      <div className="my-1 h-px bg-gradient-to-r from-transparent via-cyan-500/25 to-transparent md:my-2" />

      <div className="space-y-0 md:space-y-1">
        <p className="hidden px-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 md:block">
          Rota
        </p>
        <div className="flex flex-wrap items-center gap-1 px-0.5 py-0 text-[10px] text-neutral-400 md:gap-1.5 md:px-1 md:py-0.5 md:text-xs">
          <span
            title="Origem definida"
            className={
              hasOrigin
                ? 'inline-flex items-center gap-0.5 rounded border border-cyan-400/45 bg-cyan-500/15 px-0.5 py-px font-medium text-cyan-100 shadow-[0_0_10px_rgba(34,211,238,0.25)] md:px-1 md:py-0.5 md:text-[10px]'
                : 'inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/[0.04] px-0.5 py-px text-neutral-500 md:px-1 md:py-0.5 md:text-[10px]'
            }
          >
            <CircleDot className="size-2.5 shrink-0 md:size-2.5" aria-hidden />
            <span className="max-md:sr-only">Origem</span>
            <span className="md:hidden" aria-hidden>
              Ini
            </span>
          </span>
          <span
            title="Chegada definida"
            className={
              hasDestination
                ? 'inline-flex items-center gap-0.5 rounded border border-emerald-400/45 bg-emerald-500/15 px-0.5 py-px font-medium text-emerald-100 shadow-[0_0_10px_rgba(52,211,153,0.22)] md:px-1 md:py-0.5 md:text-[10px]'
                : 'inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/[0.04] px-0.5 py-px text-neutral-500 md:px-1 md:py-0.5 md:text-[10px]'
            }
          >
            <MapPinned className="size-2.5 shrink-0" aria-hidden />
            <span className="max-md:sr-only">Chegada</span>
            <span className="md:hidden" aria-hidden>
              Fim
            </span>
          </span>
          <button
            type="button"
            disabled={!hasOrigin && !hasDestination}
            onClick={onClearRoute}
            aria-label="Limpar rota"
            className="ml-auto inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1 py-px text-[10px] font-medium text-neutral-300 transition hover:border-rose-400/35 hover:bg-rose-500/10 hover:text-rose-100 disabled:cursor-not-allowed disabled:opacity-35 md:px-1.5 md:py-0.5"
          >
            <Trash2 className="size-2.5 md:size-3" aria-hidden />
            <span className="max-md:hidden">Rota</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {routingHint ? (
          <motion.p
            key={routingHint}
            role="status"
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.18 }}
            className={
              routingHint.startsWith('ALERTA:')
                ? 'mt-1 flex gap-1 rounded border border-rose-500/40 bg-rose-950/35 px-1.5 py-0.5 text-[10px] font-semibold leading-snug text-rose-100 md:mt-1.5 md:px-2 md:py-1 md:text-[11px]'
                : routingHint.startsWith('Atenção:')
                  ? 'mt-1 flex gap-1 rounded border border-amber-500/35 bg-amber-950/30 px-1.5 py-0.5 text-[10px] font-semibold leading-snug text-amber-100 md:mt-1.5 md:px-2 md:py-1 md:text-[11px]'
                  : 'mt-1 flex gap-1 text-[10px] leading-snug text-neutral-400 md:mt-1.5 md:text-[11px]'
            }
          >
            {routingHint.startsWith('ALERTA:') ||
            routingHint.startsWith('Atenção:') ? (
              <AlertTriangle
                className={
                  routingHint.startsWith('ALERTA:')
                    ? 'mt-0.5 size-3 shrink-0 text-rose-300/90'
                    : 'mt-0.5 size-3 shrink-0 text-amber-400/80'
                }
                aria-hidden
              />
            ) : null}
            <span>{routingHint}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}
