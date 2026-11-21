import React, { useState } from 'react';
import { BookOpen, Check, ChevronRight, Edit3, Lightbulb, X } from 'lucide-react';

export default function ComicDetailsModal({ comic, american, onClose, onEdit, onToggle, onViewOriginalIssue, formatAmericanTitle, guideSearchUrl }) {
  const [section, setSection] = useState('curiosities');

  return <div className="modal-backdrop" onClick={onClose}>
    <section className="detail-modal" onClick={event => event.stopPropagation()}>
      <button className="close" onClick={onClose} aria-label="Fechar"><X/></button>
      <div className="detail-sidebar">
        <div className="detail-cover">{comic.cover ? <img src={comic.cover} alt={`Capa de ${comic.title}`}/> : <div className="no-cover"><span>X</span></div>}</div>
        <nav className="detail-tabs" aria-label="Seções da edição">
          <button className={section === 'curiosities' ? 'detail-tab active' : 'detail-tab'} aria-label="Curiosidades" aria-pressed={section === 'curiosities'} title="Curiosidades" onClick={() => setSection('curiosities')}><Lightbulb size={17}/><span>Curiosidades</span></button>
          <button className={section === 'content' ? 'detail-tab active' : 'detail-tab'} aria-label="Conteúdo" aria-pressed={section === 'content'} title="Conteúdo" onClick={() => setSection('content')}><BookOpen size={17}/><span>Conteúdo</span></button>
        </nav>
      </div>
      <div className="detail-content">
        <div className="eyebrow">FICHA DA EDIÇÃO · #{String(comic.id).padStart(3, '0')}</div>
        <h2>{comic.title}</h2>
        <a className="guide-link comic-guide-link" href={guideSearchUrl(comic.title)} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>VER NO GUIA DOS QUADRINHOS <ChevronRight size={12}/></a>
        <div className="detail-tags"><span>{comic.original_year || 'Ano não informado'}</span><span>{comic.saga || 'Sem saga cadastrada'}</span></div>

        {section === 'curiosities' ? <section className="curiosities-section">
          <div className="curiosities-heading"><div><div className="eyebrow">PESQUISA POR EDIÇÃO</div><h3>Curiosidades</h3></div><span>{comic.curiosities?.length || 0} FATOS</span></div>
          {comic.curiosities?.length ? <ul className="curiosity-list">{comic.curiosities.map((item, index) => <li key={`${comic.id}-${index}`}>
            {item.spoiler ? <details className="spoiler-disclosure"><summary>Revelar spoiler</summary><p>{item.text}</p></details> : <p>{item.text}</p>}
            {item.source && <a href={item.source} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>FONTE: {item.source_label || 'CONSULTAR FONTE'} <ChevronRight size={12}/></a>}
          </li>)}</ul> : <p className="curiosities-empty">Curiosidades desta edição ainda não catalogadas.</p>}
        </section> : <>
          <p className="synopsis">{comic.synopsis || 'Nenhuma sinopse cadastrada.'}</p>
          <div className="issue-heading"><div><div className="eyebrow">GUIA DE CONTEÚDO</div><h3>Revistas americanas</h3></div><span>{comic.american_issues?.length || 0} ITENS</span></div>
          <div className="issue-list">{(comic.american_issues || []).map((issue, index) => <div className="issue-row" key={`${comic.id}-issue-${index}`}>
            <span className="issue-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="issue-title">{formatAmericanTitle(issue, american.find(item => item.title === issue)?.publication_year)}</span>
            <button className="guide-link original-issue-link" onClick={() => onViewOriginalIssue(issue)}>VER EDIÇÃO ORIGINAL AMERICANA <ChevronRight size={12}/></button>
            <a className="guide-link" href={guideSearchUrl(issue)} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>VER NO GUIA DOS QUADRINHOS <ChevronRight size={12}/></a>
          </div>)}</div>
          <div className="detail-foot"><div><small>STATUS DE LEITURA</small><b>{comic.is_read ? 'Você já leu este volume' : 'Este volume está na sua fila'}</b></div><div className="detail-buttons">
            <button className="secondary-button" onClick={onEdit}><Edit3 size={14}/> EDITAR</button>
            <button className={comic.is_read ? 'read-button done' : 'read-button'} onClick={onToggle}>{comic.is_read ? <><Check size={16}/> LIDO</> : <><BookOpen size={16}/> MARCAR COMO LIDO</>}</button>
          </div></div>
        </>}
      </div>
    </section>
  </div>;
}
