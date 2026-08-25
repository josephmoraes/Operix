import { useEffect, useRef, useState } from 'react';
import { Boxes, ClipboardList, LoaderCircle, Package, Search, UserRound, Wrench, X } from 'lucide-react';
import { apiGet } from './api';
import type { Screen } from './v2-types';
import './global-search.css';

type SearchType = 'ticket' | 'work_order' | 'asset' | 'item' | 'person';
type SearchResult = {
  type: SearchType;
  id: string;
  title: string;
  description: string;
  status: string | null;
  reference: string | null;
  url: string;
  score: number;
  occurredAt: string | null;
};
type SearchResponse = {
  query: string;
  count: number;
  durationMs: number;
  mode: 'local' | 'hybrid-ai';
  results: SearchResult[];
};

const typeInfo: Record<SearchType, { label: string; screen: Screen; icon: typeof Search }> = {
  ticket: { label: 'Chamado', screen: 'tickets', icon: ClipboardList },
  work_order: { label: 'Ordem de serviço', screen: 'orders', icon: Wrench },
  asset: { label: 'Equipamento', screen: 'maintenance', icon: Boxes },
  item: { label: 'Item do estoque', screen: 'warehouse', icon: Package },
  person: { label: 'Pessoa', screen: 'admin', icon: UserRound },
};

export default function GlobalSearch({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'local' | 'hybrid-ai'>('local');
  const requestId = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setError('');
      setLoading(false);
      return;
    }

    const currentRequest = ++requestId.current;
    setLoading(true);
    setError('');
    const timer = window.setTimeout(() => {
      void apiGet<SearchResponse>(`/api/search?q=${encodeURIComponent(term)}&limit=12`)
        .then(response => {
          if (currentRequest !== requestId.current) return;
          setResults(response.results);
          setMode(response.mode);
          setOpen(true);
        })
        .catch(searchError => {
          if (currentRequest !== requestId.current) return;
          setResults([]);
          setError(searchError instanceof Error ? searchError.message : 'Não foi possível pesquisar.');
          setOpen(true);
        })
        .finally(() => {
          if (currentRequest === requestId.current) setLoading(false);
        });
    }, 280);

    return () => window.clearTimeout(timer);
  }, [query]);

  const clear = () => {
    requestId.current += 1;
    setQuery('');
    setResults([]);
    setError('');
    setOpen(false);
  };

  const choose = (result: SearchResult) => {
    onNavigate(typeInfo[result.type].screen);
    clear();
  };

  return (
    <div className="global-search" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className={`global-search-input ${open ? 'open' : ''}`}>
        {loading ? <LoaderCircle className="search-spinner" /> : <Search />}
        <input
          aria-label="Pesquisar em todo o Operix"
          placeholder="Pesquisar chamados, OS, equipamentos..."
          value={query}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(event.target.value.trim().length >= 2);
          }}
          onFocus={() => query.trim().length >= 2 && setOpen(true)}
          onKeyDown={event => event.key === 'Escape' && clear()}
        />
        {query && <button type="button" aria-label="Limpar pesquisa" onClick={clear}><X /></button>}
      </div>

      {open && (
        <section className="global-search-results" aria-live="polite">
          <header>
            <span>Pesquisa global {mode === 'hybrid-ai' && <b className="search-ai-badge">IA</b>}</span>
            {!loading && !error && <small>{results.length} resultado{results.length === 1 ? '' : 's'}</small>}
          </header>
          {error && <div className="global-search-state error">{error}</div>}
          {!error && !loading && results.length === 0 && (
            <div className="global-search-state">Nenhum resultado encontrado para “{query.trim()}”.</div>
          )}
          {results.map(result => {
            const info = typeInfo[result.type];
            const Icon = info.icon;
            return (
              <button type="button" className="global-search-result" key={`${result.type}-${result.id}`} onClick={() => choose(result)}>
                <span className={`search-result-icon type-${result.type}`}><Icon /></span>
                <span className="search-result-copy">
                  <small>{info.label}{result.status ? ` · ${result.status}` : ''}</small>
                  <strong>{result.title}</strong>
                  {result.description && <span>{result.description}</span>}
                </span>
                <span className="search-result-score">{Math.round(result.score * 100)}%</span>
              </button>
            );
          })}
          {loading && <div className="global-search-state">Pesquisando na empresa ativa...</div>}
        </section>
      )}
    </div>
  );
}
