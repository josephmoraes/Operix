import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, LoaderCircle, Send, Sparkles, X } from 'lucide-react';
import { apiPost } from './api';
import type { Screen } from './v2-types';
import './navigation-assistant.css';

type Answer = { answer: string; screen: Screen | null; label: string | null };

export default function NavigationAssistant({ allowedScreens, onNavigate }: { allowedScreens: Screen[]; onNavigate: (screen: Screen) => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) window.setTimeout(() => input.current?.focus(), 50); }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const question = message.trim();
    if (question.length < 3 || loading) return;
    setLoading(true); setError(''); setAnswer(null);
    try {
      setAnswer(await apiPost<Answer>('/api/assistant/navigation', { message: question, allowedScreens }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível consultar o assistente.');
    } finally { setLoading(false); }
  };

  return <div className="navigation-assistant">
    <button type="button" className="assistant-trigger" aria-label="Perguntar ao assistente" title="Pergunte à IA onde encontrar algo" onClick={() => setOpen(value => !value)}>
      <Sparkles /><span>IA</span>
    </button>
    {open && <section className="assistant-popover" role="dialog" aria-label="Assistente de navegação">
      <header><span><Bot /><b>Assistente Operix</b></span><button type="button" aria-label="Fechar" onClick={() => setOpen(false)}><X /></button></header>
      <div className="assistant-intro">Diga o que você quer fazer e eu mostro o caminho.</div>
      <form onSubmit={submit}>
        <input ref={input} value={message} onChange={event => setMessage(event.target.value)} placeholder="Ex.: quero solicitar um EPI" maxLength={500} />
        <button type="submit" disabled={message.trim().length < 3 || loading} aria-label="Enviar">{loading ? <LoaderCircle className="assistant-spinner" /> : <Send />}</button>
      </form>
      {error && <p className="assistant-error">{error}</p>}
      {answer && <article className="assistant-answer">
        <span><Sparkles />Resposta</span><p>{answer.answer}</p>
        {answer.screen && <button type="button" onClick={() => { onNavigate(answer.screen!); setOpen(false); }}>
          {answer.label || 'Abrir tela'}<ArrowRight />
        </button>}
      </article>}
    </section>}
  </div>;
}
