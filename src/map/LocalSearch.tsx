import type { FormEvent } from 'react'
import { Home, Loader2, MapPin, Search } from 'lucide-react'

export type LocalSearchHit = {
  lat: string
  lon: string
  display_name?: string
  boundingbox?: [string, string, string, string]
}

export type LocalSearchProps = {
  query: string
  onQueryChange: (q: string) => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  loading: boolean
  error: string | null
  results: LocalSearchHit[]
  onSelectHit: (hit: LocalSearchHit) => void
  onFlyToPort: () => void
}

export function LocalSearch({
  query,
  onQueryChange,
  onSubmit,
  loading,
  error,
  results,
  onSelectHit,
  onFlyToPort,
}: LocalSearchProps) {
  return (
    <div className="rounded-lg border border-emerald-500/25 bg-slate-900/60 p-1.5 shadow-[0_0_24px_rgba(16,185,129,0.06)] backdrop-blur-md md:p-2">
      <div className="mb-1 flex items-center gap-1.5 border-b border-emerald-500/15 pb-1.5 md:mb-1.5 md:pb-2">
        <Search className="size-3.5 shrink-0 text-emerald-400/85" aria-hidden />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Ir para
        </h2>
      </div>

      <form onSubmit={onSubmit} className="space-y-1.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500"
            aria-hidden
          />
          <input
            type="search"
            name="place"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            autoComplete="off"
            placeholder="Cidade, UF…"
            aria-label="Cidade ou endereço para localizar no mapa"
            className="h-8 w-full rounded-md border border-white/10 bg-black/35 py-1.5 pl-8 pr-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:border-emerald-400/40 focus:outline-none focus:ring-1 focus:ring-emerald-400/25"
          />
        </div>
        <div className="flex flex-col gap-1 sm:flex-row">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-8 w-full flex-1 items-center justify-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 text-xs font-semibold text-cyan-100 transition hover:border-cyan-400/50 hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Search className="size-3.5" aria-hidden />
            )}
            Buscar
          </button>
          <button
            type="button"
            onClick={onFlyToPort}
            className="inline-flex h-8 w-full shrink-0 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-[11px] font-medium text-neutral-400 transition hover:border-emerald-400/35 hover:text-emerald-100 sm:w-auto"
            title="Voltar à vista do porto"
          >
            <Home className="size-3.5 text-emerald-400/80" aria-hidden />
            Porto
          </button>
        </div>
      </form>

      {results.length > 0 ? (
        <ul
          className="vale-thin-scrollbar mt-2 max-h-[150px] space-y-0.5 overflow-y-auto overscroll-contain rounded-md border border-white/5 bg-black/25 py-0.5"
          role="listbox"
          aria-label="Resultados da busca"
        >
          {results.map((hit, i) => {
            const label =
              hit.display_name?.split(',').slice(0, 3).join(',') ??
              `${hit.lat}, ${hit.lon}`
            return (
              <li key={`${hit.lat}-${hit.lon}-${i}`}>
                <button
                  type="button"
                  role="option"
                  className="flex w-full items-start gap-1.5 px-2 py-1.5 text-left text-xs text-neutral-400 transition hover:bg-cyan-500/10 hover:text-neutral-200"
                  onClick={() => onSelectHit(hit)}
                >
                  <MapPin className="mt-0.5 size-3 shrink-0 text-cyan-400/70" aria-hidden />
                  <span className="line-clamp-2 leading-snug">{label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {error ? (
        <p className="mt-1.5 px-0.5 text-[11px] leading-snug text-rose-300/90" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
