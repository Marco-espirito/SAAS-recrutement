'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import * as I from 'lucide-react';
import {
  type StoredOffer,
  STATUS_LABEL,
  initialOffers,
  initialSyncCallIndex,
  simulateProviderFetch,
  syncOffers,
} from '@/lib/offers';
import {
  type MatchFeedback,
  type MatchResult,
  computeMatch,
  defaultCandidateProfile,
  qualityStats,
} from '@/lib/matching';

type Toast=(message:string)=>void;
export type AppliedOffer={id:string;company:string;title:string;match:number};
// Persistance localStorage robuste face au double-rendu des effets en mode
// développement (React Strict Mode) : sans le drapeau `skipNextWrite`, l'effet
// d'écriture peut s'exécuter avec la valeur initiale (avant que la lecture
// n'ait restauré les données) et écraser silencieusement ce qui était
// enregistré. Le drapeau, réarmé à chaque restauration, protège l'écriture
// qui suit immédiatement une lecture, quel que soit le nombre de fois où la
// paire lecture/écriture est rejouée avant le premier rendu effectif.
export function useStored<T>(key:string,initial:T){
  const[state,setState]=useState<T>(initial);
  const skipNextWrite=useRef(false);
  useEffect(()=>{
    try{
      const v=localStorage.getItem(key);
      if(v!==null){skipNextWrite.current=true;setState(JSON.parse(v))}
    }catch{}
  },[key]);
  useEffect(()=>{
    if(skipNextWrite.current){skipNextWrite.current=false;return}
    try{localStorage.setItem(key,JSON.stringify(state))}catch{}
  },[key,state]);
  return[state,setState]as const;
}
const Btn=({children,onClick,primary=false}:{children:React.ReactNode,onClick?:()=>void,primary?:boolean})=><button className={primary?'action primary':'action'} onClick={onClick}>{children}</button>;
function PageHead({title,subtitle,children}:{title:string,subtitle:string,children?:React.ReactNode}){return <div className="module-head"><div><h1>{title}</h1><p>{subtitle}</p></div><div>{children}</div></div>}

// ------------------------------------------------------------------
// Offres d'emploi — persistance, déduplication, expiration et retrait
// géré par lib/offers.ts. Chaque synchronisation interroge le
// connecteur (simulé) et fusionne le résultat avec le fonds déjà
// enregistré : rien n'est jamais supprimé, seulement requalifié.
// ------------------------------------------------------------------
export function JobsPage({toast,onApplied}:{toast:Toast,onApplied:(j:AppliedOffer)=>void}){
  const [offers,setOffers]=useStored<StoredOffer[]>('jobpilot_offers_v3',initialOffers);
  const [callIndex,setCallIndex]=useStored<number>('jobpilot_offers_sync_idx',initialSyncCallIndex);
  const [lastSync,setLastSync]=useStored<string>('jobpilot_offers_last_sync','');
  const [query,setQuery]=useState('');
  const [location,setLocation]=useState('Lyon, France');
  const [onlySaved,setOnlySaved]=useState(false);
  const [showInactive,setShowInactive]=useState(false);

  const visible=offers.filter(o=>showInactive||o.status==='active'||o.status==='expiring_soon');
  const filtered=visible.filter(o=>(o.title+o.company+o.skills.join(' ')).toLowerCase().includes(query.toLowerCase())&&(!location||o.location.includes(location.split(',')[0]))&&(!onlySaved||o.saved));

  function toggleSave(id:string){setOffers(v=>v.map(o=>o.id===id?{...o,saved:!o.saved}:o));toast('Favoris mis à jour')}
  function apply(o:StoredOffer){
    if(o.status==='expired'||o.status==='retired_by_source'){toast('Cette offre n’est plus disponible : candidature impossible');return}
    setOffers(v=>v.map(x=>x.id===o.id?{...x,applied:true}:x));
    const result=computeMatch(defaultCandidateProfile,o);
    onApplied({id:o.id,company:o.company,title:o.title,match:result.score});
    toast(`Candidature créée pour ${o.company}`);
  }
  function runSync(){
    const now=new Date();
    const fetched=simulateProviderFetch(callIndex);
    const result=syncOffers(offers,fetched,now);
    setOffers(result.offers);
    setCallIndex(callIndex+1);
    setLastSync(now.toISOString());
    const parts:string[]=[];
    if(result.added)parts.push(`${result.added} nouvelle${result.added>1?'s':''}`);
    if(result.updated)parts.push(`${result.updated} mise${result.updated>1?'s':''} à jour`);
    if(result.reactivated)parts.push(`${result.reactivated} réactivée${result.reactivated>1?'s':''}`);
    if(result.retired)parts.push(`${result.retired} retirée${result.retired>1?'s':''} par la source`);
    if(result.duplicatesSkipped)parts.push(`${result.duplicatesSkipped} doublon${result.duplicatesSkipped>1?'s':''} ignoré${result.duplicatesSkipped>1?'s':''}`);
    toast(parts.length?`Synchronisation : ${parts.join(', ')}`:'Synchronisation : aucun changement détecté');
  }
  const counts=useMemo(()=>({
    active:offers.filter(o=>o.status==='active').length,
    expiring:offers.filter(o=>o.status==='expiring_soon').length,
    expired:offers.filter(o=>o.status==='expired').length,
    retired:offers.filter(o=>o.status==='retired_by_source').length,
  }),[offers]);

  return <div>
    <PageHead title="Offres d’emploi" subtitle="Trouvez l’opportunité qui correspond à votre prochain défi.">
      <Btn onClick={runSync}><I.RefreshCw/>Synchroniser les offres</Btn>
    </PageHead>
    <section className="panel offer-sync">
      <div className="offer-sync-stats">
        <span><b>{counts.active}</b><small>actives</small></span>
        <span><b>{counts.expiring}</b><small>expirent bientôt</small></span>
        <span><b>{counts.expired}</b><small>expirées</small></span>
        <span><b>{counts.retired}</b><small>retirées · copie conservée</small></span>
      </div>
      <div className="offer-sync-meta">
        <span>{lastSync?`Dernière synchronisation : ${new Date(lastSync).toLocaleString('fr-FR')}`:'Fonds initial — lancez une synchronisation pour interroger le connecteur.'}</span>
        <label className="b-toggle small"><input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)}/>Afficher aussi les offres expirées / retirées</label>
      </div>
    </section>
    <section className="job-search panel"><label>Poste<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Ex : Data Analyst"/></label><label>Lieu<input value={location} onChange={e=>setLocation(e.target.value)}/></label><label>Contrat<select><option>CDI</option><option>CDD</option><option>Alternance</option></select></label><label>Télétravail<select><option>Tous</option><option>Hybride</option><option>À distance</option></select></label><Btn onClick={()=>setOnlySaved(!onlySaved)}>{onlySaved?'Tous les résultats':'Mes favoris'}</Btn><Btn primary onClick={()=>toast(`${filtered.length} offres trouvées`)}><I.Search/>Rechercher</Btn></section>
    <div className="jobs-layout">
      <aside className="panel filters"><h3>Filtres</h3><b>Mots-clés</b><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="SQL, Power BI, Python"/><b>Localisation</b>{['Lyon (254)','Villeurbanne (63)','Caluire-et-Cuire (28)','Écully (22)'].map((x,n)=><label key={x}><input type="checkbox" defaultChecked={!n}/>{x}</label>)}<b>Contrat</b>{['CDI (186)','CDD (28)','Intérim (14)','Alternance (20)','Stage (16)'].map((x,n)=><label key={x}><input type="checkbox" defaultChecked={!n}/>{x}</label>)}<b>Télétravail</b>{['Télétravail complet','Hybride','Sur site'].map((x,n)=><label key={x}><input type="checkbox" defaultChecked={n===1}/>{x}</label>)}<Btn onClick={()=>{setQuery('');setLocation('Lyon, France');setOnlySaved(false)}}>Réinitialiser les filtres</Btn></aside>
      <section className="panel results">
        <header><b>{filtered.length} offres trouvées</b><span>{location.split(',')[0]}</span><select><option>Plus récentes</option><option>Meilleur match</option><option>Salaire</option></select></header>
        {filtered.map(o=>
          <article className={`offer-row status-${o.status}`} key={o.id}>
            <i>{o.company.slice(0,2).toUpperCase()}</i>
            <div className="offer-company"><b>{o.company} ✓</b><small>{o.source}</small></div>
            <div className="offer-role">
              <b>{o.title}</b>
              <small>⌖ {o.location}　○ {o.contract}　▣ {o.remote}</small>
              <p>{o.skills.map(s=><span key={s}>{s}</span>)}</p>
              <p className="offer-status-line"><span className={`offer-status ${o.status}`}>{STATUS_LABEL[o.status]}</span><small>Vue depuis le {new Date(o.firstSeenAt).toLocaleDateString('fr-FR')}{o.seenCount>1?` · vue ${o.seenCount}×`:''}</small></p>
            </div>
            <div className="offer-salary"><b>{o.salary}</b><small>annuel brut</small></div>
            <small>{o.retiredAt?'Retirée':o.status==='expired'?'Expirée':'Publiée'} {new Date(o.retiredAt||o.postedAt).toLocaleDateString('fr-FR')}</small>
            <button onClick={()=>toast(`Aperçu de ${o.title} ouvert`)}>Voir l’offre</button>
            <button className={o.saved?'saved':''} onClick={()=>toggleSave(o.id)}><I.Bookmark/></button>
            <button className="apply" disabled={o.applied||o.status==='expired'||o.status==='retired_by_source'} onClick={()=>apply(o)}>{o.applied?'Candidature envoyée':o.status==='expired'||o.status==='retired_by_source'?'Indisponible':'Candidater'}</button>
          </article>
        )}
        {!filtered.length&&<div className="empty">Aucune offre ne correspond à ces filtres.</div>}
      </section>
    </div>
  </div>;
}

// ------------------------------------------------------------------
// Matching IA — comparaison structurée par lib/matching.ts : le score
// est une somme pondérée de critères justifiés, chaque compétence
// manquante est reliée à la phrase de l'offre qui la prouve, et les
// retours des candidats alimentent un suivi de qualité.
// ------------------------------------------------------------------
export function MatchingPage({toast,onApplied}:{toast:Toast,onApplied:(j:AppliedOffer)=>void}){
  const [offers]=useStored<StoredOffer[]>('jobpilot_offers_v3',initialOffers);
  const [feedback,setFeedback]=useStored<MatchFeedback[]>('nexora_match_feedback',[]);
  const candidateOffers=useMemo(()=>offers.filter(o=>o.status!=='retired_by_source'),[offers]);
  const results=useMemo(()=>candidateOffers.map(o=>computeMatch(defaultCandidateProfile,o)).sort((a,b)=>b.score-a.score),[candidateOffers]);
  const [selectedId,setSelectedId]=useState<string|undefined>(results[0]?.offerId);
  const selected=results.find(r=>r.offerId===selectedId)||results[0];
  const selectedOffer=candidateOffers.find(o=>o.id===selected?.offerId);
  const [letter,setLetter]=useState('');
  const stats=useMemo(()=>qualityStats(feedback),[feedback]);
  const alreadyRated=feedback.some(f=>f.offerId===selected?.offerId);

  function generate(){
    if(!selectedOffer||!selected)return;
    setLetter(`Madame, Monsieur,\n\nVotre offre de ${selectedOffer.title} chez ${selectedOffer.company} correspond directement à mon expérience en analyse de données et à ma maîtrise de ${selected.matchedSkills.slice(0,3).join(', ')||'mes compétences clés'}. Je serais ravie d’échanger avec vous sur mes contributions possibles.\n\nCordialement,\nSophie Martin`);
    toast('Lettre personnalisée générée');
  }
  function rate(helpful:boolean){
    if(!selected||!selectedOffer)return;
    setFeedback(v=>[...v.filter(f=>f.offerId!==selected.offerId),{offerId:selected.offerId,offerLabel:`${selectedOffer.title} · ${selectedOffer.company}`,score:selected.score,helpful,at:new Date().toISOString()}]);
    toast(helpful?'Merci, recommandation marquée pertinente':'Merci, retour pris en compte pour affiner le matching');
  }

  if(!selected||!selectedOffer)return <div><PageHead title="Matching IA ✦" subtitle="Des offres qui correspondent à votre profil et à vos objectifs de carrière."/><div className="empty">Aucune offre disponible pour le matching. Synchronisez les offres depuis l’onglet « Offres d’emploi ».</div></div>;

  return <div>
    <PageHead title="Matching IA ✦" subtitle="Comparaison structurée par le moteur Nexora, à partir des offres réellement enregistrées.">
      <Btn onClick={()=>toast(`${results.length} correspondances recalculées`)}><I.RefreshCw/>Actualiser</Btn>
    </PageHead>
    {stats&&<section className="panel quality-card">
      <I.BadgeCheck/>
      <div><small>QUALITÉ DES RECOMMANDATIONS</small><b>{stats.helpfulRate}% jugées pertinentes</b><p>{stats.total} retour{stats.total>1?'s':''} · score moyen {stats.avgScoreHelpful}% quand jugé pertinent contre {stats.avgScoreNotHelpful}% sinon.</p></div>
    </section>}
    <div className="matching-layout">
      <section className="panel match-list">
        <header><h3>Vos meilleures correspondances</h3><span>{results.length} offres</span></header>
        {results.map(r=>{const o=candidateOffers.find(x=>x.id===r.offerId);if(!o)return null;return <button className={selected.offerId===r.offerId?'selected':''} key={r.offerId} onClick={()=>setSelectedId(r.offerId)}><strong>{r.score}%</strong><span><b>{o.title}</b><small>{o.company}<br/>{o.location}　•　{o.remote}</small></span><I.Bookmark/></button>})}
      </section>
      <section className="panel match-detail">
        <header><i>{selectedOffer.company.slice(0,2)}</i><span><h2>{selectedOffer.title}</h2><b>{selectedOffer.company} ✓</b><small>{selectedOffer.location}　•　{selectedOffer.remote}　•　{selectedOffer.contract}</small></span><strong>{selected.score}%<small>{selected.confidence}</small></strong></header>
        <h3>✦ Pourquoi ce score — justification détaillée</h3>
        <div className="match-breakdown">
          {selected.criteria.map(c=><div className="match-crit" key={c.key}>
            <div className="match-crit-head"><b>{c.label}</b><small>poids {Math.round(c.weight*100)}%</small><strong>{Math.round(c.score*100)}%</strong></div>
            <span className="match-crit-bar"><i style={{width:`${Math.round(c.score*100)}%`}}/></span>
            <small>{c.detail}</small>
          </div>)}
        </div>
        <div className="match-metrics"><span>Score final<b>{selected.score}%</b><small>{selected.confidence}</small></span><span>Compétences alignées<b>{selected.matchedSkills.length}</b><small>sur {selected.matchedSkills.length+selected.missingSkills.length} requises</small></span><span>Écart<b>{selected.missingSkills.length?`${selected.missingSkills.length} manquante(s)`:'Aucun'}</b><small>preuves ci-dessous</small></span></div>
        <div className="skill-boxes">
          <div><h3>✓ Compétences alignées</h3>{selected.matchedSkills.length?selected.matchedSkills.map(x=><span key={x}>{x}</span>):<small>Aucune compétence commune détectée.</small>}</div>
          <div><h3>⌕ Compétences manquantes — preuve à l’appui</h3>{selected.missingSkills.length?selected.missingSkills.map(x=><p className="miss-evidence" key={x.skill}><span className="miss">{x.skill}</span><small>« {x.evidence} »</small></p>):<small>Aucune compétence manquante détectée.</small>}</div>
        </div>
        <aside>
          <h3>Passez à l’action</h3>
          <Btn primary onClick={()=>toast('Version du CV adaptée créée')}>Adapter mon CV</Btn>
          <Btn onClick={generate}>Générer lettre</Btn>
          <Btn onClick={()=>{onApplied({id:selectedOffer.id,company:selectedOffer.company,title:selectedOffer.title,match:selected.score});toast('Ajoutée à vos candidatures')}}>Ajouter à mes candidatures</Btn>
          <div className="match-feedback">
            <small>Cette recommandation vous semble-t-elle pertinente ?</small>
            <div>
              <button className={alreadyRated&&feedback.find(f=>f.offerId===selected.offerId)?.helpful?'active':''} onClick={()=>rate(true)}><I.ThumbsUp/></button>
              <button className={alreadyRated&&!feedback.find(f=>f.offerId===selected.offerId)?.helpful?'active':''} onClick={()=>rate(false)}><I.ThumbsDown/></button>
            </div>
          </div>
        </aside>
        {letter&&<div className="generated"><header><b>Lettre générée</b><button onClick={()=>navigator.clipboard?.writeText(letter)}>Copier</button><button onClick={()=>setLetter('')}>Fermer</button></header><pre>{letter}</pre></div>}
      </section>
    </div>
  </div>;
}

export type Application={id:number;company:string;role:string;stage:string;score:number};
export const seedApps:Application[]=[{id:1,company:'Alan',role:'Product Designer',stage:'À postuler',score:82},{id:2,company:'Airbus',role:'Data Analyst',stage:'Envoyée',score:88},{id:3,company:'ACME Corp',role:'Business Analyst',stage:'Relance',score:84},{id:4,company:'GreenTech',role:'Sustainability Analyst',stage:'Relance',score:79},{id:5,company:'PayFit',role:'Product Manager',stage:'Entretien',score:87},{id:6,company:'Qonto',role:'Product Designer',stage:'Offre',score:91},{id:7,company:'Stripe',role:'Data Analyst',stage:'Refusée',score:76}];
export function ApplicationsPage({toast,external}:{toast:Toast,external:Application[]}){const[apps,setApps]=useStored<Application[]>('jobpilot_apps',seedApps);useEffect(()=>{if(external.length)setApps(v=>[...v,...external.filter(x=>!v.some(y=>y.id===x.id))])},[external,setApps]);const stages=['À postuler','Envoyée','Relance','Entretien','Offre','Refusée'];function move(id:number,dir:number){setApps(v=>v.map(a=>a.id===id?{...a,stage:stages[Math.max(0,Math.min(stages.length-1,stages.indexOf(a.stage)+dir))]}:a));toast('Statut de la candidature mis à jour')}function add(){let company=prompt('Entreprise ?');if(!company)return;let role=prompt('Poste ?')||'Poste à définir';setApps(v=>[...v,{id:Date.now(),company,role,stage:'À postuler',score:75}]);toast('Nouvelle candidature créée')}return <div><PageHead title="Mes candidatures" subtitle="Suivez toutes vos candidatures et avancez dans votre recherche d’emploi."><Btn primary onClick={add}><I.Plus/>Nouvelle candidature</Btn></PageHead><section className="stats compact"><div><b>Total candidatures</b><strong>{apps.length}</strong></div><div><b>En cours</b><strong>{apps.filter(a=>!['Refusée','Offre'].includes(a.stage)).length}</strong></div><div><b>Entretiens</b><strong>{apps.filter(a=>a.stage==='Entretien').length}</strong></div><div><b>Offres</b><strong>{apps.filter(a=>a.stage==='Offre').length}</strong></div><div><b>Taux de réponse</b><strong>28%</strong></div></section><div className="application-toolbar"><input placeholder="Rechercher une candidature..."/><select><option>Statut : Tous</option></select><Btn onClick={()=>toast('Filtres appliqués')}><I.Filter/>Filtres</Btn></div><section className="application-board">{stages.map((s,n)=><div className={'app-column stage'+n} key={s}><header><b>{s}</b><span>{apps.filter(a=>a.stage===s).length}</span></header>{apps.filter(a=>a.stage===s).map(a=><article key={a.id}><b>{a.company}</b><span>{a.role}</span><small>Score {a.score}%</small><footer><button disabled={!n} onClick={()=>move(a.id,-1)}>←</button><button onClick={()=>toast(`Fiche ${a.company} ouverte`)}>Détails</button><button disabled={n===stages.length-1} onClick={()=>move(a.id,1)}>→</button></footer></article>)}<button onClick={add}>＋ Ajouter</button></div>)}</section></div>}

type Reminder={id:number;company:string;role:string;date:string;channel:string;status:string};
const reminders:Reminder[]=[{id:1,company:'ACME Corp',role:'Data Analyst',date:'20 mai 2025',channel:'Email',status:'À relancer'},{id:2,company:'GreenTech',role:'Data Engineer',date:'21 mai 2025',channel:'LinkedIn',status:'À relancer'},{id:3,company:'TechFlow',role:'Product Owner',date:'22 mai 2025',channel:'LinkedIn',status:'À relancer'},{id:4,company:'InnovaData',role:'BI Analyst',date:'26 mai 2025',channel:'Email',status:'Planifiée'}];
export function FollowupsPage({toast}:{toast:Toast}){const[rows,setRows]=useStored<Reminder[]>('jobpilot_reminders',reminders);const[message,setMessage]=useState('');function schedule(){let company=prompt('Entreprise à relancer ?');if(!company)return;setRows(v=>[...v,{id:Date.now(),company,role:'Poste ciblé',date:'Demain',channel:'Email',status:'Planifiée'}]);toast('Relance programmée')}function generate(company='ACME Corp'){setMessage(`Bonjour,\n\nJe me permets de revenir vers vous concernant ma candidature chez ${company}. Je reste très intéressée par cette opportunité et disponible pour échanger à votre convenance.\n\nBien cordialement,\nSophie Martin`);toast('Message de relance généré')}return <div><PageHead title="Relances ✉" subtitle="Gérez et automatisez vos relances pour ne jamais passer inaperçue."/><section className="stats compact four"><div><b>Relances à faire aujourd’hui</b><strong>{rows.filter(x=>x.status==='À relancer').length}</strong></div><div><b>Réponses en attente</b><strong>18</strong></div><div><b>Entretiens à venir</b><strong>4</strong></div><div><b>Messages envoyés</b><strong>42</strong></div></section><div className="follow-layout"><section className="panel follow-table"><header><h3>Mes relances</h3><Btn onClick={()=>toast('Filtres ouverts')}><I.Filter/>Filtres</Btn><Btn primary onClick={schedule}><I.CalendarPlus/>Programmer une relance</Btn></header>{rows.map(r=><article key={r.id}><i>{r.company.slice(0,2)}</i><b>{r.company}</b><span>{r.role}</span><span>{r.date}<small>{r.status==='À relancer'?'Aujourd’hui':'Planifiée'}</small></span><span>{r.channel}</span><em className={r.status==='À relancer'?'due':''}>{r.status}</em><button onClick={()=>generate(r.company)}>Générer</button><button onClick={()=>{setRows(v=>v.filter(x=>x.id!==r.id));toast('Relance supprimée')}}>⋮</button></article>)}</section><aside><section className="panel templates"><h3>Templates de relance</h3>{['Relance après candidature','Relance après entretien','Relance LinkedIn','Relance sans réponse'].map(x=><button key={x} onClick={()=>generate()}>{x}<span>›</span></button>)}<Btn onClick={()=>generate()}><I.Sparkles/>Générer un message IA</Btn></section><section className="panel calendar"><h3>Calendrier & rappels</h3>{rows.slice(0,4).map(r=><p key={r.id}><i>◉</i><span><b>{r.company}</b><small>{r.role} · {r.channel}</small></span><strong>{r.date}</strong></p>)}</section></aside></div>{message&&<div className="modal"><div><header><h3>Message de relance</h3><button onClick={()=>setMessage('')}>×</button></header><textarea value={message} onChange={e=>setMessage(e.target.value)}/><footer><Btn onClick={()=>navigator.clipboard?.writeText(message)}>Copier</Btn><Btn primary onClick={()=>{toast('Message marqué comme envoyé');setMessage('')}}>Marquer comme envoyé</Btn></footer></div></div>}</div>}

type Doc={id:number,name:string,type:string,version:string,date:string,status:string};
const seedDocs:Doc[]=[{id:1,name:'CV_Sophie_Martin.pdf',type:'PDF',version:'v3.2',date:'16 mai 2025',status:'Principal'},{id:2,name:'Lettre_motivation_ACME_Corp.docx',type:'DOCX',version:'v1.1',date:'15 mai 2025',status:'Partagé'},{id:3,name:'Certificat_Google_Analytics.pdf',type:'PDF',version:'v1.0',date:'12 mai 2025',status:'À jour'},{id:4,name:'Portfolio_Sophie_Martin.pdf',type:'PDF',version:'v2.0',date:'10 mai 2025',status:'À jour'}];
export function DocumentsPage({toast}:{toast:Toast}){const[docs,setDocs]=useStored<Doc[]>('jobpilot_docs',seedDocs);const input=useRef<HTMLInputElement>(null);function upload(files:FileList|null){if(!files)return;setDocs(v=>[...Array.from(files).map((f,n)=>({id:Date.now()+n,name:f.name,type:f.name.split('.').pop()?.toUpperCase()||'FICHIER',version:'v1.0',date:'Aujourd’hui',status:'À jour'})),...v]);toast(`${files.length} document(s) ajouté(s)`)}function download(d:Doc){let blob=new Blob([`Document JobPilot\n${d.name}\nVersion ${d.version}`],{type:'text/plain'});let a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=d.name+'.txt';a.click();URL.revokeObjectURL(a.href);toast('Téléchargement lancé')}return <div><PageHead title="Mes documents 📁" subtitle="Organisez, gérez et partagez tous vos documents au même endroit."><input hidden multiple ref={input} type="file" onChange={e=>upload(e.target.files)}/><Btn onClick={()=>input.current?.click()}><I.Upload/>Téléverser</Btn><Btn onClick={()=>toast('Nouveau dossier créé')}><I.FolderPlus/>Créer un dossier</Btn><Btn primary onClick={()=>navigator.clipboard?.writeText(location.href)}><I.Share2/>Partager</Btn></PageHead><section className="panel categories"><h3>Catégories</h3>{[['CV',docs.filter(x=>x.name.startsWith('CV')).length,'purple'],['Lettres de motivation',docs.filter(x=>x.name.includes('Lettre')).length,'blue'],['Certificats',docs.filter(x=>x.name.includes('Certificat')).length,'green'],['Portfolio',docs.filter(x=>x.name.includes('Portfolio')).length,'orange'],['Autres',Math.max(docs.length-4,0),'gray']].map(x=><button key={x[0] as string} onClick={()=>toast(`Catégorie « ${x[0]} » : ${x[1]} fichier(s)`)}><I.Folder className={x[2] as string}/><b>{x[0]}</b><small>{x[1]} fichiers</small></button>)}</section><div className="docs-layout"><section className="panel docs-table"><header><h3>Tous les documents</h3><select><option>Tous les types</option><option>PDF</option><option>DOCX</option></select></header><div className="doc-head"><span>Nom</span><span>Type</span><span>Version</span><span>Modifié le</span><span>Statut</span></div>{docs.map(d=><article key={d.id}><i>{d.type}</i><b>{d.name}</b><span>{d.type}</span><span>{d.version}</span><span>{d.date}</span><em>{d.status}</em><button onClick={()=>download(d)}><I.Download/></button><button onClick={()=>{setDocs(v=>v.filter(x=>x.id!==d.id));toast('Document supprimé')}}>⋮</button></article>)}</section><aside><section className="panel recent-docs"><h3>Documents récents</h3>{docs.slice(0,4).map(d=><button key={d.id} onClick={()=>download(d)}><i>{d.type}</i><span><b>{d.name}</b><small>Modifié {d.date}</small></span>⋮</button>)}</section><section className="panel doc-versions"><h3>Versions du CV</h3>{['v3.2 (actuelle)','v3.1','v3.0'].map((x,n)=><p key={x}><I.Clock3/><span><b>{x}</b><small>{16-n*6} mai 2025</small></span></p>)}<Btn onClick={()=>toast('Comparateur de versions ouvert')}>Comparer les versions</Btn></section></aside></div></div>}

export function Toast({message}:{message:string}){return message?<div className="toast"><I.CircleCheck/>{message}</div>:null}
