import { apiFetch } from './supabase.js';
import { useState } from 'react';
import { Search, X, Save, LoaderCircle } from 'lucide-react';

export default function CoverSearchModal({ issue, onClose, onSaved }) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('comicvineApiKey') || '');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    if (!apiKey.trim()) {
      setError('Informe sua chave da API Comic Vine.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      localStorage.setItem('comicvineApiKey', apiKey.trim());
      const response = await apiFetch('/api/comicvine/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim(), title: issue.title }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'A busca falhou.');
      setResults(payload.results || []);
      if (!payload.results?.length) setError('Nenhuma capa encontrada para este título.');
    } catch (cause) {
      setError(cause.message || 'Não foi possível consultar a Comic Vine.');
    } finally {
      setBusy(false);
    }
  }

  async function saveCover(candidate) {
    setBusy(true);
    setError('');
    try {
      const imageResponse = await apiFetch('/api/comicvine/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: candidate.image }),
      });
      const image = await imageResponse.json();
      if (!imageResponse.ok) throw new Error(image.error || 'Não foi possível baixar a capa.');

      const saveResponse = await apiFetch(`/api/american/${issue.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: issue.title, cover: image.data }),
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saved.error || 'Não foi possível salvar a capa.');
      onSaved();
    } catch (cause) {
      setError(cause.message || 'Não foi possível salvar a capa.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop" onClick={onClose}>
    <section className="add-modal cover-search-modal" onClick={(event) => event.stopPropagation()}>
      <button className="close" onClick={onClose} aria-label="Fechar"><X size={18}/></button>
      <div className="eyebrow">BUSCA DE CAPA · COMIC VINE</div>
      <h2>{issue.title}</h2>
      <p className="form-intro">A busca usa o título desta revista. Confira a edição antes de salvar a capa.</p>
      <label className="field">Chave da API Comic Vine
        <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Cole sua API key" />
        <small>A chave fica salva neste navegador. <a href="https://comicvine.gamespot.com/api/" target="_blank" rel="noreferrer">Obter chave</a></small>
      </label>
      <button className="cover-search-submit" onClick={search} disabled={busy}><Search size={15}/>{busy ? 'BUSCANDO…' : 'BUSCAR CAPAS'}</button>
      {error && <div className="form-error">{error}</div>}
      <div className="cover-search-results">
        {results.map((candidate) => <article className="cover-candidate" key={candidate.id}>
          <img src={candidate.image} alt={`Capa de ${candidate.volume} ${candidate.issue_number}`} />
          <div><b>{candidate.volume || 'Série não informada'} #{candidate.issue_number}</b><small>{candidate.name || 'Edição'}</small></div>
          <button className="save-button" onClick={() => saveCover(candidate)} disabled={busy}><Save size={14}/>{busy ? 'SALVANDO…' : 'USAR CAPA'}</button>
        </article>)}
      </div>
      {busy && <LoaderCircle className="cover-search-spinner" size={17}/>}
      <p className="cover-search-credit">Dados e imagens: <a href="https://comicvine.gamespot.com/" target="_blank" rel="noreferrer">Comic Vine</a></p>
    </section>
  </div>;
}
