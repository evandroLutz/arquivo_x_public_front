import { apiFetch } from './supabase.js';
import { useEffect, useState } from 'react';
import { Search, X, Save, LoaderCircle, Check } from 'lucide-react';

const BATCH_SIZE = 100;
const CLASSIC_XMEN_SEARCH_VERSION = 2;
const isClassicXmen1963 = (issue) => /^Uncanny X-Men\s*\(1963\)\s*#?\d+(?:\.\d+)?$/i.test(issue?.title || '');

export default function BulkCoverSearchModal({ onClose, onSaved }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('comicvineApiKey') || '');
  const [issues, setIssues] = useState([]);
  const [entries, setEntries] = useState([]);
  const [cursor, setCursor] = useState(0);
  const [loadingIssues, setLoadingIssues] = useState(true);
  const [progressReady, setProgressReady] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/american')
      .then((response) => response.json())
      .then((allIssues) => {
        const current = allIssues.filter((issue) => !issue.cover);
        const saved = JSON.parse(localStorage.getItem('comicvineBulkProgress') || 'null');
        if (saved?.issues?.length) {
          const currentById = new Map(current.map((issue) => [issue.id, issue]));
          const savedEntries = saved.entries || [];
          const entriesById = new Map(savedEntries.map((entry) => [entry.issue.id, entry]));
          const completedIds = new Set(saved.issues.slice(0, saved.cursor || 0)
            .map((issue) => currentById.get(issue.id))
            .filter((issue) => issue && (!isClassicXmen1963(issue)
              || entriesById.get(issue.id)?.searchVersion === CLASSIC_XMEN_SEARCH_VERSION))
            .map((issue) => issue.id));
          const savedIssues = saved.issues.map((issue) => currentById.get(issue.id)).filter(Boolean);
          const queue = [
            ...savedIssues.filter((issue) => completedIds.has(issue.id)),
            ...savedIssues.filter((issue) => !completedIds.has(issue.id)),
          ];
          const queuedIds = new Set(queue.map((issue) => issue.id));
          queue.push(...current.filter((issue) => !queuedIds.has(issue.id)));
          setIssues(queue);
          setCursor(completedIds.size);
          setEntries(savedEntries.filter((entry) => currentById.has(entry.issue.id)
            && (!isClassicXmen1963(currentById.get(entry.issue.id))
              || entry.searchVersion === CLASSIC_XMEN_SEARCH_VERSION)));
        } else {
          setIssues(current);
        }
        setProgressReady(true);
      })
      .catch(() => setError('Não foi possível carregar as revistas sem capa.'))
      .finally(() => setLoadingIssues(false));
  }, []);

  useEffect(() => {
    if (!progressReady || loadingIssues) return;
    localStorage.setItem('comicvineBulkProgress', JSON.stringify({ issues, cursor, entries }));
  }, [issues, cursor, entries, progressReady, loadingIssues]);

  async function searchNextBatch() {
    if (!apiKey.trim()) {
      setError('Informe sua chave da API Comic Vine.');
      return;
    }
    const batch = issues.slice(cursor, cursor + BATCH_SIZE);
    if (!batch.length) return;

    localStorage.setItem('comicvineApiKey', apiKey.trim());
    setSearching(true);
    setError('');
    const found = [];
    for (const issue of batch) {
      try {
        const response = await apiFetch('/api/comicvine/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: apiKey.trim(), title: issue.title }),
        });
        const payload = await response.json();
        if (response.status === 429) {
          setError(payload.error || 'Limite da API atingido. Aguarde antes de continuar.');
          break;
        }
        if (!response.ok) throw new Error(payload.error || 'Busca indisponível.');
        found.push({ issue, results: (payload.results || []).slice(0, 3), selected: '', searchVersion: CLASSIC_XMEN_SEARCH_VERSION });
      } catch (cause) {
        found.push({ issue, results: [], selected: '', error: cause.message, searchVersion: CLASSIC_XMEN_SEARCH_VERSION });
      }
      setEntries((current) => [...current, ...found.slice(-1)]);
      setCursor((current) => current + 1);
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
    setSearching(false);
  }

  function selectResult(issueId, resultId) {
    setEntries((current) => current.map((entry) => entry.issue.id === issueId
      ? { ...entry, selected: resultId }
      : entry));
  }

  async function saveSelected() {
    const selected = entries.filter((entry) => entry.selected);
    if (!selected.length) return;
    setSaving(true);
    setError('');
    let savedCount = 0;
    try {
      for (const entry of selected) {
        const candidate = entry.results.find((result) => String(result.id) === String(entry.selected));
        const imageResponse = await apiFetch('/api/comicvine/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: candidate.image }),
        });
        const image = await imageResponse.json();
        if (!imageResponse.ok) throw new Error(image.error || `Falha ao baixar a capa de ${entry.issue.title}.`);
        const response = await apiFetch(`/api/american/${entry.issue.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: entry.issue.title, cover: image.data }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Falha ao salvar a capa de ${entry.issue.title}.`);
        savedCount += 1;
        setEntries((current) => current.filter((item) => item.issue.id !== entry.issue.id));
      }
      await onSaved(savedCount);
    } catch (cause) {
      setError(cause.message || 'Não foi possível salvar todas as capas selecionadas.');
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = entries.filter((entry) => entry.selected).length;
  const pendingCount = Math.max(issues.length - cursor, 0);

  return <div className="modal-backdrop" onClick={onClose}>
    <section className="add-modal bulk-cover-modal" onClick={(event) => event.stopPropagation()}>
      <button className="close" onClick={onClose} aria-label="Fechar"><X size={18}/></button>
      <div className="eyebrow">BUSCA EM LOTE · COMIC VINE</div>
      <h2>Buscar capas americanas</h2>
      <p className="form-intro">A busca percorre as revistas sem capa em grupos de até {BATCH_SIZE}. Confira os resultados e marque uma opção antes de salvar.</p>
      <label className="field">Chave da API Comic Vine
        <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Cole sua API key" />
        <small>A chave fica salva neste navegador. A API permite 200 buscas por hora. <a href="https://comicvine.gamespot.com/api/" target="_blank" rel="noreferrer">Obter chave</a></small>
      </label>
      <div className="bulk-cover-controls">
        <button className="cover-search-submit" onClick={searchNextBatch} disabled={searching || saving || loadingIssues || pendingCount === 0}>
          <Search size={15}/>{searching ? `BUSCANDO ${cursor}/${issues.length}…` : pendingCount ? `BUSCAR PRÓXIMAS ${Math.min(BATCH_SIZE, pendingCount)}` : 'BUSCA CONCLUÍDA'}
        </button>
        <span>{loadingIssues ? 'Carregando…' : `${cursor} de ${issues.length} consultadas · ${pendingCount} restantes`}</span>
      </div>
      {error && <div className="form-error">{error}</div>}
      {searching && <div className="bulk-cover-progress"><i style={{ width: `${issues.length ? cursor / issues.length * 100 : 0}%` }}/></div>}
      <div className="bulk-cover-results">
        {entries.map((entry) => <article className="bulk-cover-entry" key={entry.issue.id}>
          <div className="bulk-cover-entry-title"><b>{entry.issue.title}</b>{entry.error && <small>{entry.error}</small>}{!entry.results.length && !entry.error && <small>Nenhuma capa encontrada</small>}</div>
          {entry.results.length > 0 && <div className="bulk-cover-candidates">
            {entry.results.map((candidate) => <label className={`bulk-cover-candidate ${String(entry.selected) === String(candidate.id) ? 'selected' : ''}`} key={candidate.id}>
              <input type="radio" name={`cover-${entry.issue.id}`} checked={String(entry.selected) === String(candidate.id)} onChange={() => selectResult(entry.issue.id, candidate.id)} />
              <img src={candidate.image} alt="" />
              <span><b>{candidate.volume || 'Série não informada'} #{candidate.issue_number}</b><small>{candidate.name || 'Edição'}</small></span>
            </label>)}
          </div>}
        </article>)}
      </div>
      {searching && <LoaderCircle className="cover-search-spinner" size={17}/>}
      <div className="form-actions">
        <button className="cancel-button" onClick={onClose}>FECHAR</button>
        <button className="save-button" onClick={saveSelected} disabled={!selectedCount || searching || saving}>
          {saving ? <LoaderCircle size={14}/> : <><Save size={14}/><Check size={14}/></>}
          {saving ? 'SALVANDO…' : `SALVAR ${selectedCount} CAPA(S)`}
        </button>
      </div>
      <p className="cover-search-credit">Dados e imagens: <a href="https://comicvine.gamespot.com/" target="_blank" rel="noreferrer">Comic Vine</a></p>
    </section>
  </div>;
}
