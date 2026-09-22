'use client';
import { useEffect, useRef, useState } from 'react';
import * as I from 'lucide-react';
import {
  ApplicationsPage,
  DocumentsPage,
  FollowupsPage,
  JobsPage,
  MatchingPage,
  Toast,
  seedApps,
  useStored,
  type AppliedOffer,
  type Application,
} from './candidate-pages';
import { ImportedCVSummary, parseCV, type ParsedCV } from './cv-import';
import { initialOffers, STATUS_LABEL, type StoredOffer } from '@/lib/offers';
import {
  ACTIONS_CATALOG,
  AutomationBuilder,
  describeGroup,
  triggerOf,
  type AutomationFlow,
  type ConditionGroup,
  type ConditionLeaf,
} from './automation-builder';
type Mode = 'candidate' | 'recruiter' | 'admin';
type CandidateTab =
  | 'Tableau de bord'
  | 'Mon CV'
  | 'Analyse ATS'
  | "Offres d'emploi"
  | 'Matching IA'
  | 'Mes candidatures'
  | 'Relances'
  | 'Documents'
  | 'Automatisations';
const cNav = [
  [I.House, 'Tableau de bord'],
  [I.FileText, 'Mon CV'],
  [I.Target, 'Analyse ATS'],
  [I.BriefcaseBusiness, "Offres d'emploi"],
  [I.Bot, 'Matching IA'],
  [I.LayoutDashboard, 'Mes candidatures'],
  [I.RefreshCw, 'Relances'],
  [I.Zap, 'Automatisations'],
  [I.FileText, 'Documents'],
];
const rNav = [
  [I.House, 'Tableau de bord'],
  [I.Building2, 'CRM'],
  [I.Users, 'Candidats'],
  [I.BriefcaseBusiness, 'Postes ouverts'],
  [I.Workflow, 'Pipeline'],
  [I.CalendarDays, 'Entretiens'],
  [I.Zap, 'Automatisations'],
  [I.ChartNoAxesCombined, 'Analytics'],
];
const aNav = [
  [I.House, 'Tableau de bord'],
  [I.BriefcaseBusiness, 'Offres'],
  [I.UserRound, 'Candidats'],
  [I.Workflow, 'Pipeline'],
  [I.CalendarDays, 'Entretiens'],
  [I.Mail, 'Emails & Automations'],
  [I.Users, 'Clients'],
  [I.ChartNoAxesCombined, 'Statistiques'],
];
const jobs = [
  ['A', 'Data Analyst', 'ACME Corp', '92%'],
  ['◆', 'Analyste Data BI', 'GreenTech', '88%'],
  ['◉', 'Data Engineer', 'TechFlow', '85%'],
  ['▥', 'Chargé(e) d’études Data', 'InnovData', '75%'],
  ['pb', 'Data Analyst – Marketing', 'People Business', '68%'],
];
const people = [
  'Camille Dupont',
  'Thomas Bernard',
  'Sophie Martin',
  'Lucas Moreau',
  'Fatou Diop',
  'Antoine Lefèvre',
  'Inès Khaldi',
  'Julien Petit',
  'Claire Rousseau',
  'Nicolas Garnier',
  'Awa Traoré',
  'Hugo Robert',
  'Élodie Bernard',
  'Mehdi Benali',
  'Yanis Belkacem',
  'Laura Simon',
];
function Sidebar({
  mode,
  setMode,
  tab,
  setTab,
  toast,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  tab: string;
  setTab: (t: any) => void;
  toast: (x: string) => void;
}) {
  let nav = mode === 'candidate' ? cNav : mode === 'recruiter' ? rNav : aNav;
  const spaces: Array<[Mode, typeof I.House, string]> = [
    ['candidate', I.UserRound, 'Candidat'],
    ['recruiter', I.Building2, 'Recruteur'],
    ['admin', I.ShieldCheck, 'Admin'],
  ];
  function selectSpace(next: Mode) {
    setMode(next);
    setTab('Tableau de bord');
  }
  return (
    <aside className="sidebar">
      <div className="logo">
        <span>◆</span>
        <b>Nexora</b>
      </div>
      <div className="space-switcher">
        <small>ESPACE DE TRAVAIL</small>
        <div>{spaces.map(([key,Icon,label]) => <button title={`Espace ${label}`} className={mode===key?'active':''} onClick={()=>selectSpace(key)} key={key}><Icon/><span>{label}</span></button>)}</div>
      </div>
      <nav>
        {nav.map(([X, s], n) => {
          let Icon = X as typeof I.House;
          let label = s as string;
          return (
            <button
              onClick={() => setTab(label)}
              className={tab === label ? 'active' : ''}
              key={label}
            >
              <Icon />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidefoot">
        <button onClick={() => toast('Paramètres ouverts')}>
          <I.Settings />
          Paramètres
        </button>
        <button
          onClick={() =>
            toast(
              mode === 'admin'
                ? 'Gestion des utilisateurs & rôles ouverte'
                : 'Centre d’aide & support ouvert',
            )
          }
        >
          <I.CircleHelp />
          {mode === 'admin' ? 'Utilisateurs & rôles' : 'Aide & Support'}
        </button>
        {mode === 'candidate' ? (
          <div className="ai-usage">
            <span><I.Sparkles/><b>Nexora AI</b><em>PRO</em></span>
            <p>72 actions IA restantes</p><i><b style={{width:'72%'}}/></i>
          </div>
        ) : mode === 'recruiter' ? (
          <div className="help">
            <b>Nexora Recruit</b>
            <small>8 postes actifs · 142 candidats</small>
          </div>
        ) : (
          <div className="help">
            <b>Besoin d’aide ?</b>
            <small>Consultez notre centre d’aide →</small>
          </div>
        )}
      </div>
    </aside>
  );
}
function Top({
  mode,
  toast,
}: {
  mode: Mode;
  toast: (x: string) => void;
}) {
  const profile = mode === 'candidate'
    ? ['SM', 'Sophie Martin', 'Candidate Premium']
    : mode === 'recruiter'
      ? ['MD', 'Marc Dubois', 'Recruiter Pro']
      : ['MK', 'Marc Kouassi', 'Administrateur'];
  return (
    <header className="top">
      <button
        className="menu-toggle"
        aria-label="Menu"
        onClick={() => toast('Navigation')}
      >
        <I.Menu />
      </button>
      <label>
        <I.Search />
        <input
          placeholder={
            mode === 'candidate'
              ? 'Rechercher une offre, entreprise, compétence...'
              : 'Rechercher un client, contact, poste ou candidat...'
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = (e.target as HTMLInputElement).value.trim();
              toast(v ? `Recherche : « ${v} »` : 'Saisissez un terme à rechercher');
            }
          }}
        />
      </label>
      <button
        className="quick-create"
        onClick={() => toast('Menu de création rapide ouvert')}
      >
        <I.Plus />
        Créer
      </button>
      <button
        className="bell"
        aria-label="Notifications"
        onClick={() =>
          toast(
            `${mode === 'candidate' ? 3 : 8} nouvelle(s) notification(s)`,
          )
        }
      >
        <I.Bell />
        <i>{mode === 'candidate' ? 3 : 8}</i>
      </button>
      <button
        className="user"
        onClick={() => toast(`Menu du profil de ${profile[1]}`)}
      >
        <i>{profile[0]}</i>
        <span>
          <b>{profile[1]}</b>
          <small>{profile[2]}</small>
        </span>
        <I.ChevronDown />
      </button>
    </header>
  );
}
const tones = ['purple', 'green', 'blue', 'orange', 'purple'];
function Stat({
  Icon,
  label,
  value,
  delta,
  n = 0,
}: {
  Icon: any;
  label: string;
  value: string;
  delta: string;
  n?: number;
}) {
  return (
    <div className="stat">
      <i className={tones[n]}>
        <Icon />
      </i>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>↗ {delta} cette semaine</small>
      </div>
    </div>
  );
}
function Head({ admin = false }: { admin?: boolean }) {
  return (
    <div className="head">
      <div>
        <h1>
          {admin ? 'Tableau de bord administrateur' : 'Tableau de bord'} 👋
        </h1>
        <p>
          {admin
            ? 'Vue d’ensemble de votre activité recrutement'
            : 'Bonjour Sophie, voici un aperçu de votre recherche d’emploi.'}
        </p>
      </div>
      <div>
        <button>
          12 – 18 mai 2025 <I.ChevronDown />
        </button>
        <button className="primary">
          <I.Plus />
          {admin ? 'Nouvelle offre' : 'Nouvelle recherche'}
        </button>
      </div>
    </div>
  );
}
function Chart() {
  return (
    <div className="chart">
      <svg viewBox="0 0 500 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="g" x2="0" y2="1">
            <stop stopColor="#683cf3" stopOpacity=".25" />
            <stop offset="1" stopColor="#683cf3" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 82L30 75 55 68 80 55 105 46 130 54 155 43 180 47 205 32 230 41 255 29 280 39 305 28 330 26 355 39 380 32 405 24 430 29 460 18 500 21V100H0Z"
          fill="url(#g)"
        />
        <polyline
          points="0,82 30,75 55,68 80,55 105,46 130,54 155,43 180,47 205,32 230,41 255,29 280,39 305,28 330,26 355,39 380,32 405,24 430,29 460,18 500,21"
          fill="none"
          stroke="#6338f5"
          strokeWidth="2.5"
        />
      </svg>
    </div>
  );
}
function Candidate() {
  let apps = [
    ['Candidature envoyée', '6'],
    ['En cours', '4'],
    ['Entretien', '2'],
    ['Offre', '1'],
  ];
  return (
    <>
      <Head />
      <section className="nexora-brief">
        <div className="ai-orb"><I.Sparkles /></div>
        <div>
          <small>NEXORA AI · BRIEF DU JOUR</small>
          <h3>3 candidatures attendent une relance depuis plus de 7 jours.</h3>
          <p>Je peux préparer des messages personnalisés pour ACME, Orange et Capgemini.</p>
        </div>
        <button data-ask="relances">Préparer les relances <I.ArrowRight /></button>
      </section>
      <section className="stats">
        <Stat
          Icon={I.Target}
          label="Offres recommandées"
          value="32"
          delta="+8"
        />
        <Stat
          Icon={I.Send}
          label="Candidatures envoyées"
          value="18"
          delta="+5"
          n={1}
        />
        <Stat
          Icon={I.CalendarDays}
          label="Entretiens"
          value="4"
          delta="+1"
          n={2}
        />
        <Stat
          Icon={I.RefreshCw}
          label="Taux de réponse"
          value="22%"
          delta="+6%"
          n={3}
        />
        <Stat
          Icon={I.Target}
          label="Score moyen de match"
          value="84%"
          delta="+5%"
          n={4}
        />
      </section>
      <section className="two">
        <div className="panel jobs">
          <Title
            t="Matching IA"
            sub="Offres les plus pertinentes pour vous"
            link="Voir toutes les offres"
          />
          {jobs.map((j, n) => (
            <div className="job" key={j[1]}>
              <i className={'co c' + n}>{j[0]}</i>
              <div>
                <b>{j[1]}</b>
                <small>{j[2]} · Lyon, France · Hybride</small>
              </div>
              <strong className={'score s' + n}>{j[3]}</strong>
              <em>CDI</em>
              <em className={n < 3 ? 'new' : ''}>
                {n < 3 ? 'Nouveau' : '1 sem.'}
              </em>
              <I.Bookmark />
            </div>
          ))}
        </div>
        <div className="panel">
          <Title t="Mes candidatures" link="Voir le Kanban" />
          <div className="kanban">
            {apps.map((a, n) => (
              <div className={'col x' + n} key={a[0]}>
                <header>
                  <b>{a[0]}</b>
                  <strong>{a[1]}</strong>
                </header>
                <p>
                  ◈ ACME Corp<small>12 mai</small>
                </p>
                <p>
                  ◆ GreenTech<small>10 mai</small>
                </p>
                <button>＋</button>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="three">
        <div className="panel analysis">
          <Title t="Analyse de mon profil" />
          <div>
            <strong className="ring">
              87%<small>Score global</small>
            </strong>
            <span>
              <b>Compétences fortes</b>
              <p className="good">SQL　Python　Power BI　Excel　Tableau</p>
              <b>Compétences à développer</b>
              <p className="warn">Data Modeling　BigQuery　AWS　Snowflake</p>
            </span>
          </div>
          <a>Voir l’analyse complète →</a>
        </div>
        <Activity />
        <div className="panel market">
          <Title t="Tendances du marché" link="Voir le rapport complet" />
          <small>Salaire moyen – Data Analyst (France)</small>
          <h2>
            46 000 € <small>/ an</small>
          </h2>
          <b className="pos">↑ 6 % vs période précédente</b>
          <Chart />
        </div>
      </section>
      <section className="automation-strip panel">
        <Title t="Automatisations actives" link="Gérer les workflows" />
        {[
          ['Job Watcher', '32 offres analysées ce matin', true],
          ['Relance automatique', '3 actions à valider', true],
          ['Analyse CV', 'Dernière analyse : 84%', true],
          ['LinkedIn Watcher', 'Connexion requise', false],
        ].map((a) => <div key={a[0] as string}><i className={a[2] ? 'on' : ''} /><span><b>{a[0]}</b><small>{a[1]}</small></span><em>{a[2] ? 'Actif' : 'Pause'}</em></div>)}
      </section>
    </>
  );
}
function Title({ t, sub, link }: { t: string; sub?: string; link?: string }) {
  return (
    <div className="title">
      <b>
        {t} {sub && <small>– {sub}</small>}
      </b>
      {link && <a>{link}</a>}
    </div>
  );
}
function Activity() {
  return (
    <div className="panel activity">
      <Title t="Activité récente" />
      {[
        'Invitation à un entretien chez ACME Corp',
        'Candidature envoyée à GreenTech',
        'Nouveau match : Data Engineer chez TechFlow',
        'Relance envoyée à DataVision',
        'Votre CV a été consulté par ACME Corp',
      ].map((x, n) => (
        <p key={x}>
          <i>▣</i>
          {x}
          <small>Il y a {n + 1} h</small>
        </p>
      ))}
      <a>Voir toute l’activité</a>
    </div>
  );
}
function CandidateCV() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [parsed, setParsed] = useState<ParsedCV | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function importCV(files: FileList | null) {
    let selected = files?.[0];
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      alert('Sélectionnez un fichier PDF.');
      return;
    }
    if (url) URL.revokeObjectURL(url);
    setFile(selected);
    setUrl(URL.createObjectURL(selected));
    setLoading(true);
    setError('');
    try {
      setParsed(await parseCV(selected));
    } catch {
      setParsed(null);
      setError('Le PDF s’affiche, mais son texte n’a pas pu être extrait.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="cv-page">
      <div className="cv-head">
        <div>
          <h1>Mon CV</h1>
          <p>
            Gérez, améliorez et partagez votre CV pour booster vos candidatures.
          </p>
        </div>
        <div>
          <input
            ref={input}
            hidden
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => importCV(e.target.files)}
          />
          <button data-live="true" onClick={() => input.current?.click()}>
            <I.Upload />
            Importer un CV
          </button>
          <button data-live="true" onClick={() => window.print()}>
            <I.Download />
            Télécharger PDF
          </button>
          <button className="primary">
            <I.Plus />
            Créer une nouvelle version
          </button>
        </div>
      </div>
      {file && url && !parsed && (
        <section className="pdf-preview panel">
          <header>
            <div>
              <i>PDF</i>
              <span>
                <b>{file.name}</b>
                <small>
                  {(file.size / 1024).toFixed(0)} Ko · Importé maintenant
                </small>
              </span>
            </div>
            <div>
              <button onClick={() => window.open(url, '_blank')}>
                <I.ExternalLink />
                Ouvrir
              </button>
              <button
                onClick={() => {
                  setFile(null);
                  setParsed(null);
                  URL.revokeObjectURL(url);
                  setUrl('');
                }}
              >
                Fermer ×
              </button>
            </div>
          </header>
          <iframe title={`Aperçu de ${file.name}`} src={url} />
        </section>
      )}
      {loading && (
        <div className="cv-import-status">
          <I.LoaderCircle /> Analyse et structuration du CV…
        </div>
      )}
      {error && <div className="cv-import-status error">{error}</div>}
      {parsed && file && <ImportedCVSummary cv={parsed} file={file} />}
      <div className={`cv-layout ${parsed ? 'demo-hidden' : ''}`}>
        <aside className="cv-left">
          <section className="panel profile-card">
            <div className="portrait">
              SM<span>✎</span>
            </div>
            <div>
              <h3>Sophie Martin</h3>
              <b>Product Manager</b>
              <small>
                <I.MapPin /> Lyon, France
              </small>
            </div>
            <hr />
            <p>
              <I.BriefcaseBusiness />
              <span>
                Poste recherché<b>Product Manager</b>
              </span>
            </p>
            <p>
              <I.MapPin />
              <span>
                Localisation
                <b>
                  Lyon, France
                  <br />
                  Télétravail partiel
                </b>
              </span>
            </p>
            <p>
              <I.Clock3 />
              <span>
                Disponibilité<b>Immédiate</b>
              </span>
            </p>
            <p>
              <I.WalletCards />
              <span>
                Salaire souhaité<b>45k – 55k € brut/an</b>
              </span>
            </p>
            <hr />
            <p>
              <I.Link />
              <span>
                Portfolio<b className="link">sophiemartin.design</b>
              </span>
            </p>
            <p>
              <I.Link />
              <span>
                LinkedIn<b className="link">linkedin.com/in/sophie-martin</b>
              </span>
            </p>
          </section>
          <section className="panel keyword-card">
            <Title t="Mots-clés principaux" link="Modifier" />
            <div>
              {[
                'Product Management',
                'Roadmap',
                'Agile',
                'Data-driven',
                'User Research',
                'KPI',
                'SQL',
                'Dashboard',
                'A/B Testing',
                'Stakeholders',
              ].map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          </section>
          <section className="panel current-file">
            <b>Fichier actuel</b>
            <p>
              <i>PDF</i>
              <span>
                <b>{file?.name || 'CV_Sophie_Martin_v3.pdf'}</b>
                <small>
                  {file ? 'Importé maintenant' : 'Mis à jour le 12 mai 2025'}
                  <br />
                  {file ? `${(file.size / 1024).toFixed(0)} Ko` : '356 Ko'}
                </small>
              </span>
            </p>
          </section>
        </aside>
        <article className="cv-paper">
          <header>
            <h2>Sophie Martin</h2>
            <h3>Product Manager</h3>
            <p>
              ✉ sophie.martin@email.com　 ·　 ☎ +33 6 12 34 56 78　 ·　 ⌖ Lyon,
              France
            </p>
            <p>in linkedin.com/in/sophie-martin　 ·　 ✉ sophiemartin.design</p>
          </header>
          <div className="cv-columns">
            <div className="cv-main">
              <CVSection title="PROFIL">
                <p>
                  Product Manager orientée impact, avec 5 ans d’expérience dans
                  la conception et le lancement de produits digitaux centrés
                  utilisateur. J’accompagne les équipes dans la définition de
                  stratégies produit data-driven pour créer de la valeur et
                  atteindre les objectifs business.
                </p>
              </CVSection>
              <CVSection title="EXPÉRIENCES">
                <Experience
                  role="Product Manager"
                  company="ACME Corp"
                  date="Janv. 2022 – Aujourd’hui"
                />
                <Experience
                  role="Product Owner"
                  company="GreenTech"
                  date="Juin 2020 – Déc. 2021"
                />
                <Experience
                  role="Assistante Cheffe de Produit"
                  company="InnovData"
                  date="Sept. 2018 – Mai 2020"
                />
              </CVSection>
              <CVSection title="FORMATION">
                <Experience
                  role="Master 2 – Marketing & Management de l’Innovation"
                  company="Université Jean Moulin Lyon 3"
                  date="2016 – 2018"
                />
                <Experience
                  role="Licence Économie & Gestion"
                  company="Université Jean Moulin Lyon 3"
                  date="2013 – 2016"
                />
              </CVSection>
            </div>
            <aside className="cv-side">
              <CVSection title="COMPÉTENCES">
                <ul>
                  {[
                    'Gestion de produit',
                    'Roadmap & Priorisation',
                    'Analyse de données',
                    'SQL & Excel avancé',
                    'A/B Testing',
                    'Agile (Scrum)',
                    'Notion, Jira, Confluence',
                    'Product Analytics',
                    'User Research',
                  ].map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </CVSection>
              <CVSection title="PROJETS">
                <b>Refonte Onboarding Utilisateur</b>
                <p>
                  Refonte complète du parcours d’onboarding, +22% d’activation
                  utilisateur en 3 mois.
                </p>
                <b>Dashboard Produit</b>
                <p>
                  Création d’un dashboard centralisé pour suivre les KPI
                  produits.
                </p>
              </CVSection>
              <CVSection title="LANGUES">
                <b>Français</b>
                <p>Langue maternelle</p>
                <b>Anglais</b>
                <p>Courant (C1)</p>
                <b>Espagnol</b>
                <p>Intermédiaire (B1)</p>
              </CVSection>
            </aside>
          </div>
        </article>
        <aside className="cv-right">
          <section className="panel completeness">
            <Title t="Score de complétude" />
            <div>
              <strong>92%</strong>
              <span>
                <b>Excellent !</b>
                <p>
                  Votre CV est très complet.
                  <br />
                  Continuez ainsi.
                </p>
                <a>Voir le détail →</a>
              </span>
            </div>
          </section>
          <section className="panel suggestions">
            <Title t="Suggestions IA" link="Nouveau" />
            {[
              [
                '✦',
                'Ajoutez des résultats chiffrés à vos expériences',
                '+8% d’impact potentiel',
              ],
              [
                '▣',
                'Développez votre section “Projets”',
                '+6% d’impact potentiel',
              ],
              [
                '□',
                'Mentionnez vos outils clés en compétences',
                '+4% d’impact potentiel',
              ],
            ].map((x) => (
              <p key={x[1]}>
                <i>{x[0]}</i>
                <span>
                  <b>{x[1]}</b>
                  <small>{x[2]}</small>
                </span>
              </p>
            ))}
            <a>Voir toutes les suggestions →</a>
          </section>
          <section className="panel versions">
            <Title t="Versions du CV" link="Voir toutes" />
            {[
              ['v3 (actuelle)', '12 mai 2025'],
              ['v2', '28 avr. 2025'],
              ['v1', '10 mars 2025'],
            ].map((x) => (
              <p key={x[0]}>
                <b>{x[0]}</b>
                <small>{x[1]}　 Sophie Martin</small>
                <i>⋮</i>
              </p>
            ))}
          </section>
          <section className="panel quick">
            <Title t="Actions rapides" />
            <button>
              <I.Target />
              <span>
                <b>Optimiser pour une offre</b>
                <small>Adaptez votre CV à une offre spécifique</small>
              </span>
              ›
            </button>
            <button>
              <I.Share2 />
              <span>
                <b>Partager mon CV</b>
                <small>Générez un lien partageable</small>
              </span>
              ›
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
function CandidateATS() {
  let criteria = [
    ['Format', '92%', 'Excellent', 'green'],
    ['Lisibilité', '78%', 'Bon', 'blue'],
    ['Mots-clés', '76%', 'Bon', 'orange'],
    ['Structure', '88%', 'Très bon', 'purple'],
    ['Pertinence', '81%', 'Très bon', 'green'],
  ];
  let found = [
    'SQL',
    'Python',
    'Tableau',
    'Power BI',
    'Excel',
    'BigQuery',
    'Google Analytics',
    'ETL',
    'Looker',
    'Data Visualisation',
    'A/B Testing',
    'KPI',
    'Dashboards',
    'Reporting',
    '+14',
  ];
  let missing = [
    'Snowflake',
    'dbt',
    'Airflow',
    'Azure Synapse',
    'Machine Learning',
    'Data Governance',
    'Storytelling',
    'Agile',
  ];
  return (
    <div className="ats-page">
      <div className="cv-head ats-head">
        <div>
          <h1>Analyse ATS de mon CV</h1>
          <p>
            Voici l’analyse de votre CV{' '}
            <b>“Sophie Martin - Data Analyst.pdf”</b>
          </p>
        </div>
        <div>
          <button>
            <I.Download />
            Télécharger le rapport
          </button>
          <button className="primary">
            <I.Sparkles />
            Optimiser mon CV
          </button>
        </div>
      </div>
      <div className="ats-layout">
        <div className="ats-main">
          <section className="panel ats-overview">
            <Title t="Score ATS global" />
            <div className="ats-overview-body">
              <div className="ats-gauge">
                <strong>82%</strong>
                <b>Très bon</b>
                <small>⌃ +12%　vs analyse précédente</small>
                <p>
                  ⓘ Votre CV a de fortes chances de passer les filtres ATS et
                  d’attirer l’attention des recruteurs.
                </p>
              </div>
              <div className="criteria">
                {criteria.map((c, n) => (
                  <div className="criterion" key={c[0]}>
                    <i className={c[3]}>
                      {
                        [
                          <I.ClipboardCheck key="a" />,
                          <I.ListChecks key="b" />,
                          <I.KeyRound key="c" />,
                          <I.LayoutGrid key="d" />,
                          <I.Target key="e" />,
                        ][n]
                      }
                    </i>
                    <b>{c[0]}</b>
                    <span>
                      <em className={c[3]} style={{ width: c[1] }} />
                    </span>
                    <strong>{c[1]}</strong>
                    <small>{c[2]}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <div className="ats-pairs">
            <section className="panel ats-keywords good-box">
              <Title t="✓ Mots-clés détectés" link="28" />
              <div>
                {found.map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
            </section>
            <section className="panel ats-keywords missing-box">
              <Title t="⚠ Mots-clés manquants" link="8" />
              <div>
                {missing.map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
            </section>
            <section className="panel ats-list">
              <Title t="✓ Points forts" />
              <ul>
                {[
                  'Format de CV moderne et bien structuré',
                  'Excellente utilisation des mots-clés techniques',
                  'Expérience quantifiée avec des résultats concrets',
                  'Parcours cohérent et lisible',
                  'Bon équilibre entre hard skills et soft skills',
                ].map((x) => (
                  <li key={x}>✓　{x}</li>
                ))}
              </ul>
              <I.ThumbsUp />
            </section>
            <section className="panel ats-list recommendations">
              <Title t="⚠ Recommandations prioritaires" />
              <ol>
                <li>
                  Ajouter des compétences manquantes importantes (Snowflake,
                  dbt)
                </li>
                <li>Renforcer la section outils & technologies</li>
                <li>Inclure plus de résultats chiffrés et d’impact business</li>
              </ol>
              <a>Voir toutes les recommandations　→</a>
            </section>
          </div>
          <footer className="ats-foot">
            ♢　Analyse basée sur les meilleures pratiques ATS et les données du
            marché.<span>Dernière analyse : 18 mai 2025 à 10:24</span>
          </footer>
        </div>
        <aside className="panel ats-compare">
          <Title t="Comparer à une offre" />
          <div className="offer-head">
            <i>
              <I.BriefcaseBusiness />
            </i>
            <span>
              <b>Data Analyst Sénior</b>
              <small>ACME Corp　•　Paris, France</small>
            </span>
            <button>Changer d’offre</button>
          </div>
          <h5>Correspondance globale</h5>
          <div className="match-summary">
            <strong>78%</strong>
            <span>
              <b>Bonne correspondance</b>
              <small>+9%　vs analyse précédente</small>
            </span>
          </div>
          <h5>Compétences requises</h5>
          <div className="required">
            {[
              'SQL',
              'Python',
              'Tableau',
              'Power BI',
              'BigQuery',
              'Git',
              'Excel avancé',
              'Statistiques',
              'Data Visualisation',
            ].map((x) => (
              <span key={x}>• {x}</span>
            ))}
          </div>
          <h5>Détail de la correspondance</h5>
          <div className="match-details">
            {[
              ['Compétences techniques', '82%'],
              ['Outils & logiciels', '75%'],
              ['Expérience', '70%'],
              ['Formation', '90%'],
              ['Secteur', '65%'],
            ].map((x, n) => (
              <p key={x[0]}>
                <i>{n + 1}</i>
                <b>{x[0]}</b>
                <span>
                  <em style={{ width: x[1] }} />
                </span>
                <strong>{x[1]}</strong>
              </p>
            ))}
          </div>
          <button className="primary full">
            <I.Sparkles />
            Générer une version adaptée
          </button>
          <a>Voir le détail complet　→</a>
        </aside>
      </div>
    </div>
  );
}
function CVSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="cv-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}
function Experience({
  role,
  company,
  date,
}: {
  role: string;
  company: string;
  date: string;
}) {
  return (
    <div className="experience">
      <b>{role}</b>
      <span>{date}</span>
      <strong>{company}</strong>
      <ul>
        <li>
          Pilotage de la roadmap produit et coordination d’une équipe
          pluridisciplinaire.
        </li>
        <li>
          Amélioration de l’engagement produit grâce à l’analyse des données.
        </li>
      </ul>
    </div>
  );
}

const companies = [
  {name:'ACME Corp', sector:'Technologie', city:'Lyon', contacts:3, jobs:2, status:'Client actif'},
  {name:'GreenTech', sector:'Énergie', city:'Paris', contacts:2, jobs:1, status:'Prospect chaud'},
  {name:'Orange', sector:'Télécoms', city:'Lyon', contacts:4, jobs:3, status:'Client actif'},
  {name:'Sopra Steria', sector:'Conseil', city:'Annecy', contacts:2, jobs:1, status:'À relancer'},
];

function CRMPage({toast}:{toast:(x:string)=>void}) {
  const [selected,setSelected] = useState(0);
  const c = companies[selected];
  return <div className="crm-page">
    <div className="module-head"><div><h1>CRM recrutement</h1><p>Clients, contacts et opportunités réunis dans une vue à 360°.</p></div><div><button className="action" onClick={()=>toast('Import d’entreprises (CSV) ouvert')}><I.Upload/>Importer</button><button className="action primary" onClick={()=>toast('Nouvelle entreprise créée')}><I.Plus/>Nouvelle entreprise</button></div></div>
    <section className="stats compact four"><div><b>Entreprises</b><strong>48</strong><small>+6 ce mois</small></div><div><b>Contacts</b><strong>126</strong><small>18 décideurs actifs</small></div><div><b>Postes ouverts</b><strong>24</strong><small>8 prioritaires</small></div><div><b>Placements</b><strong>9</strong><small>Ce trimestre</small></div></section>
    <div className="crm-layout">
      <section className="panel company-list"><header><b>Entreprises</b><label><I.Search/><input placeholder="Rechercher..." /></label></header>{companies.map((x,n)=><button key={x.name} className={selected===n?'selected':''} onClick={()=>setSelected(n)}><i>{x.name.slice(0,2).toUpperCase()}</i><span><b>{x.name}</b><small>{x.sector} · {x.city}</small></span><em>{x.jobs} postes</em></button>)}</section>
      <section className="panel company-detail">
        <header><i>AC</i><div><small>ENTREPRISE</small><h2>{c.name}</h2><p>{c.sector} · {c.city} · 250–500 employés</p></div><span>{c.status}</span><button onClick={()=>toast('Menu entreprise ouvert')}>•••</button></header>
        <nav>{['Vue d’ensemble','Contacts','Opportunités','Emails','Documents','Notes'].map((x,n)=><b className={!n?'active':''} key={x}>{x}</b>)}</nav>
        <div className="crm-detail-grid">
          <div><article><Title t="Contacts" link="+ Ajouter" />{[['Sarah Martin','RH','SM'],['Paul Durand','Data Manager','PD'],['Marc Henry','Recruiter','MH']].map(x=><p className="contact" key={x[0]}><i>{x[2]}</i><span><b>{x[0]}</b><small>{x[1]}</small></span><button onClick={()=>toast(`Email à ${x[0]} préparé`)}><I.Mail/></button></p>)}</article><article><Title t="Opportunités" link="Voir le pipeline" />{[['Data Analyst','12 candidats','Prioritaire'],['Data Engineer','8 candidats','En cours']].map(x=><p className="opportunity" key={x[0]}><I.BriefcaseBusiness/><span><b>{x[0]}</b><small>{x[1]}</small></span><em>{x[2]}</em></p>)}</article></div>
          <article className="timeline"><Title t="Historique" link="Tout afficher" />{[['25 sept.','Entretien planifié','Sophie Martin · Data Analyst'],['19 sept.','Relance envoyée','Sarah Martin a ouvert l’email'],['15 sept.','Email envoyé','Présentation de 3 candidats'],['12 sept.','Candidature ajoutée','Sophie Martin']].map((x,n)=><p key={x[0]}><i className={n===0?'now':''}/><span><small>{x[0]}</small><b>{x[1]}</b><em>{x[2]}</em></span></p>)}</article>
        </div>
        <footer><button onClick={()=>toast('Note ajoutée')}><I.StickyNote/>Ajouter une note</button><button onClick={()=>toast('Tâche créée')}><I.CheckSquare/>Créer une tâche</button><button onClick={()=>toast('Rendez-vous planifié')}><I.CalendarPlus/>Rendez-vous</button></footer>
      </section>
    </div>
  </div>
}

// ------------------------------------------------------------------
// Seeds au format du constructeur visuel (app/automation-builder.tsx) :
// des identifiants et dates fixes, pour rester déterministes entre le
// rendu serveur et le premier rendu client.
// ------------------------------------------------------------------
function seedLeaf(id: string, field: string, operator: string, value: string): ConditionLeaf {
  return { id, kind: 'leaf', field, operator, value };
}
function seedGroup(id: string, children: ConditionLeaf[]): ConditionGroup {
  return { id, kind: 'group', op: 'AND', children };
}
const seedFlows: AutomationFlow[] = [
  {
    id: 'seed-relance',
    name: 'Relance sans réponse',
    triggerKind: 'no_response',
    conditions: seedGroup('seed-relance-g', [seedLeaf('seed-relance-l1', 'daysSince', 'gte', '7')]),
    delay: { amount: 2, unit: 'heures' },
    actions: [{ id: 'seed-relance-a1', kind: 'send_message', params: { channel: 'Email', template: 'Relance polie après 7 jours sans réponse.' } }],
    status: 'active',
    createdAt: '2026-08-20T09:00:00.000Z',
    executions: 12,
    lastRun: '2026-09-20T08:00:00.000Z',
  },
  {
    id: 'seed-jobwatcher',
    name: 'Job Watcher Data Lyon',
    triggerKind: 'new_offer',
    conditions: seedGroup('seed-jw-g', [
      seedLeaf('seed-jw-l1', 'match', 'gte', '80'),
      seedLeaf('seed-jw-l2', 'location', 'contains', 'Lyon'),
    ]),
    actions: [{ id: 'seed-jw-a1', kind: 'create_task', params: { title: 'Analyser et préparer la candidature' } }],
    status: 'active',
    createdAt: '2026-08-18T09:00:00.000Z',
    executions: 38,
    lastRun: '2026-09-21T07:30:00.000Z',
  },
  {
    id: 'seed-qualif',
    name: 'Qualification candidat',
    triggerKind: 'candidate_added',
    conditions: seedGroup('seed-q-g', [seedLeaf('seed-q-l1', 'cvComplete', 'eq', 'Oui')]),
    actions: [{ id: 'seed-q-a1', kind: 'add_to_pipeline', params: { stage: 'Qualifiés' } }],
    status: 'active',
    createdAt: '2026-08-10T09:00:00.000Z',
    executions: 24,
    lastRun: '2026-09-19T14:10:00.000Z',
  },
  {
    id: 'seed-linkedin',
    name: 'LinkedIn Watcher',
    triggerKind: 'application_sent',
    conditions: seedGroup('seed-li-g', [seedLeaf('seed-li-l1', 'stage', 'eq', 'Relance')]),
    actions: [{ id: 'seed-li-a1', kind: 'notify', params: { message: 'Contact décideur détecté, créer une tâche de prospection.' } }],
    status: 'paused',
    createdAt: '2026-08-05T09:00:00.000Z',
    executions: 0,
  },
];

function AutomationsPage({toast}:{toast:(x:string)=>void}) {
  const [flows, setFlows] = useStored<AutomationFlow[]>('nexora_automation_flows_v2', seedFlows);
  const [editing, setEditing] = useState<AutomationFlow | 'new' | null>(null);

  function toggle(id: string) {
    setFlows((v) =>
      v.map((f) => (f.id === id ? { ...f, status: f.status === 'active' ? 'paused' : 'active' } : f)),
    );
    const f = flows.find((x) => x.id === id);
    toast(f?.status === 'active' ? 'Automatisation mise en pause' : 'Automatisation activée');
  }
  function saveFlow(next: AutomationFlow) {
    setFlows((v) => (v.some((f) => f.id === next.id) ? v.map((f) => (f.id === next.id ? next : f)) : [next, ...v]));
    setEditing(null);
  }
  const totalExecutions = flows.reduce((s, f) => s + f.executions, 0);
  const activeCount = flows.filter((f) => f.status === 'active').length;

  return <div>
    <div className="module-head">
      <div><h1>Centre d’automatisation</h1><p>Nexora surveille, décide et agit selon vos règles — construites visuellement, testées avant activation.</p></div>
      <button className="action primary" onClick={() => setEditing('new')}><I.Plus/>Créer un workflow</button>
    </div>
    <section className="automation-hero">
      <I.Zap/>
      <div><small>ACTIVITÉ DE LA PLATEFORME</small><h2>{totalExecutions} tâches exécutées automatiquement</h2><p>{activeCount} workflow{activeCount>1?'s':''} actif{activeCount>1?'s':''} sur {flows.length} au total.</p></div>
      <span><b>{flows.length?Math.round(activeCount/flows.length*100):0}%</b><small>de workflows actifs</small></span>
    </section>
    <div className="flow-grid">
      {flows.map((f) => {
        const trigger = triggerOf(f.triggerKind);
        const isOn = f.status === 'active';
        return <article className="panel flow-card" key={f.id}>
          <header>
            <i className={isOn?'on':''}><I.Zap/></i>
            <div><h3>{f.name}</h3><small>{f.executions} exécution{f.executions>1?'s':''}{f.status==='draft'?' · brouillon':''}</small></div>
            <button className={`switch ${isOn?'on':''}`} onClick={()=>toggle(f.id)}><i/></button>
          </header>
          <div className="flow">
            <span><small>QUAND</small><b>{trigger.label}</b></span>
            <I.ArrowRight/>
            <span><small>SI{f.delay?' / ATTENDRE':''}</small><b>{describeGroup(f.conditions, trigger.fields)}{f.delay?` · puis ${f.delay.amount} ${f.delay.unit}`:''}</b></span>
            <I.ArrowRight/>
            <span><small>ALORS</small><b>{f.actions.map(a=>ACTIONS_CATALOG.find(x=>x.kind===a.kind)?.label||a.kind).join(', ')||'Aucune action'}</b></span>
          </div>
          <footer>
            <span className={isOn?'live':''}>● {f.status==='draft'?'Brouillon':isOn?'Active':'En pause'}</span>
            <button onClick={()=>setEditing(f)}><I.ListTree/>Modifier</button>
            <button onClick={()=>toast(`Historique de « ${f.name} » : ${f.executions} exécution${f.executions>1?'s':''}${f.lastRun?`, dernière le ${new Date(f.lastRun).toLocaleDateString('fr-FR')}`:''}`)}>Voir l’historique</button>
          </footer>
        </article>;
      })}
    </div>
    {editing && <AutomationBuilder flow={editing==='new'?null:editing} onSave={saveFlow} onClose={()=>setEditing(null)} toast={toast} />}
  </div>;
}

function RecruiterDashboard({setTab}:{setTab:(x:any)=>void}) {
  return <><div className="head"><div><h1>Bonjour Marc 👋</h1><p>Voici les priorités de votre équipe recrutement aujourd’hui.</p></div><div><button>Cette semaine <I.ChevronDown/></button><button className="primary"><I.Plus/>Nouveau poste</button></div></div>
    <section className="nexora-brief recruiter"><div className="ai-orb"><I.Sparkles/></div><div><small>NEXORA AI · OPPORTUNITÉ</small><h3>4 candidats dépassent 85 % de matching pour vos postes prioritaires.</h3><p>Deux sont disponibles immédiatement et n’ont pas encore été contactés.</p></div><button data-ask="candidats">Voir les candidats <I.ArrowRight/></button></section>
    <section className="stats"><Stat Icon={I.Building2} label="Clients actifs" value="18" delta="+2"/><Stat Icon={I.BriefcaseBusiness} label="Postes ouverts" value="24" delta="+3" n={1}/><Stat Icon={I.Users} label="Candidats actifs" value="142" delta="+18" n={2}/><Stat Icon={I.CalendarDays} label="Entretiens" value="12" delta="+4" n={3}/><Stat Icon={I.BadgeCheck} label="Placements" value="9" delta="+2" n={4}/></section>
    <section className="recruiter-grid"><div className="panel"><Title t="Pipeline recrutement" link="Ouvrir le pipeline"/><div className="mini-pipeline">{[['Nouveaux','42'],['Qualifiés','28'],['Entretien','12'],['Offre','4'],['Placés','9']].map((x,n)=><div key={x[0]}><span style={{height:`${45+n*11}px`}}/><b>{x[1]}</b><small>{x[0]}</small></div>)}</div></div><div className="panel priorities"><Title t="Priorités du jour" link="Tout voir"/>{['Valider 4 shortlists pour ACME','Préparer 3 entretiens Data Engineer','Relancer Orange sur le poste BI','Signer le placement de Sophie Martin'].map((x,n)=><p key={x}><i>{n+1}</i><span><b>{x}</b><small>{n+1} action{n?'s':''} requise{n?'s':''}</small></span><I.ChevronRight/></p>)}</div><div className="panel client-health"><Title t="Clients à suivre" link="Ouvrir le CRM"/>{companies.slice(0,3).map((x,n)=><p key={x.name}><i>{x.name.slice(0,2)}</i><span><b>{x.name}</b><small>{x.jobs} poste{x.jobs>1?'s':''} ouvert{x.jobs>1?'s':''}</small></span><em className={n===1?'warn':''}>{n===1?'À relancer':'Actif'}</em></p>)}<button onClick={()=>setTab('CRM')}>Accéder au CRM <I.ArrowRight/></button></div></section>
  </>
}

const talentRows = [
  ['Sophie Martin','Data Analyst','92%','Disponible','Lyon'],
  ['Thomas Bernard','Data Engineer','89%','En process','Paris'],
  ['Fatou Diop','Product Manager','87%','Disponible','Remote'],
  ['Mehdi Benali','Data Scientist','84%','À contacter','Lyon'],
  ['Inès Khaldi','BI Analyst','81%','Entretien','Grenoble'],
];

function RecruiterModule({tab,toast}:{tab:string;toast:(x:string)=>void}) {
  if(tab==='Candidats') return <div><ModuleHero eyebrow="TALENT INTELLIGENCE" title="Candidats" subtitle="Un vivier qualifié, enrichi et priorisé par Nexora AI." action="Ajouter un candidat" Icon={I.Users} onAction={()=>toast('Formulaire d’ajout de candidat ouvert')}/><section className="talent-layout"><div className="panel talent-table"><header><label><I.Search/><input placeholder="Rechercher un candidat, une compétence..."/></label><button onClick={()=>toast('Filtres avancés ouverts')}><I.Filter/>Filtres avancés</button></header><div className="table-head"><span>Candidat</span><span>Poste cible</span><span>Matching</span><span>Localisation</span><span>Statut</span></div>{talentRows.map((r,n)=><article key={r[0]}><i>{r[0].split(' ').map(x=>x[0]).join('')}</i><span><b>{r[0]}</b><small>{n+3} ans d’expérience · CV enrichi</small></span><b>{r[1]}</b><strong>{r[2]}</strong><span>{r[4]}</span><em className={`status s${n}`}>{r[3]}</em><button onClick={()=>toast(`Profil de ${r[0]} ouvert`)}><I.ChevronRight/></button></article>)}</div><aside><section className="panel ai-shortlist"><I.Sparkles/><small>NEXORA AI</small><h3>Shortlist intelligente</h3><p>4 profils correspondent à plus de 85 % au poste Data Analyst d’ACME.</p><button data-ask="candidats">Générer la shortlist</button></section><section className="panel talent-pool"><Title t="Talent pools" link="Gérer"/>{[['Data & BI','48'],['Engineering','36'],['Product','21'],['Marketing','18']].map(x=><p key={x[0]}><span>{x[0]}</span><b>{x[1]}</b></p>)}</section></aside></section></div>;
  if(tab==='Postes ouverts') return <div><ModuleHero eyebrow="RECRUITMENT" title="Postes ouverts" subtitle="Pilotez vos missions et identifiez les blocages avant qu’ils ne ralentissent vos recrutements." action="Nouveau poste" Icon={I.BriefcaseBusiness} onAction={()=>toast('Création d’un nouveau poste')}/><section className="job-cards">{[['Data Analyst','ACME Corp','12','92%','Prioritaire'],['Data Engineer','Orange','8','89%','Actif'],['Product Manager','GreenTech','16','86%','Actif'],['BI Analyst','Sopra Steria','6','81%','À relancer']].map((x,n)=><article className="panel" key={x[0]}><header><i><I.BriefcaseBusiness/></i><em className={n===3?'warn':''}>{x[4]}</em><button onClick={()=>toast(`Options du poste ${x[0]}`)}>•••</button></header><h3>{x[0]}</h3><p>{x[1]} · {n%2?'Paris':'Lyon'} · CDI</p><div><span><small>CANDIDATS</small><b>{x[2]}</b></span><span><small>MEILLEUR MATCH</small><b>{x[3]}</b></span><span><small>DEPUIS</small><b>{n+2} j</b></span></div><footer><span><i style={{width:`${84-n*9}%`}}/></span><button onClick={()=>toast(`Poste ${x[0]} ouvert`)}>Ouvrir <I.ArrowRight/></button></footer></article>)}</section></div>;
  if(tab==='Pipeline') return <div><ModuleHero eyebrow="ATS PIPELINE" title="Pipeline candidats" subtitle="Faites progresser chaque talent de la qualification au placement." action="Ajouter au pipeline" Icon={I.Workflow} onAction={()=>toast('Ajout d’un candidat au pipeline')}/><section className="modern-pipeline">{[['À qualifier','42'],['Préqualification','28'],['Entretien','12'],['Shortlist','8'],['Offre','4'],['Placé','9']].map((c,n)=><div key={c[0]}><header><i/><b>{c[0]}</b><span>{c[1]}</span></header>{talentRows.slice(0,n<2?3:2).map((p,k)=><article className="panel" key={p[0]+n}><small>{['ACME Corp','Orange','GreenTech'][k]}</small><b>{p[0]}</b><span>{p[1]}</span><footer><em>{p[2]} match</em><i>{p[0].split(' ').map(x=>x[0]).join('')}</i></footer></article>)}<button onClick={()=>toast('Nouveau candidat ajouté')}>＋ Ajouter</button></div>)}</section></div>;
  if(tab==='Entretiens') return <div><ModuleHero eyebrow="SCHEDULING" title="Entretiens" subtitle="Centralisez les rendez-vous, les évaluations et les comptes rendus." action="Planifier" Icon={I.CalendarDays} onAction={()=>toast('Planification d’un entretien')}/><section className="interview-layout"><div className="panel schedule"><header><button onClick={()=>toast('Semaine précédente')}>‹</button><h3>Septembre 2026</h3><button onClick={()=>toast('Semaine suivante')}>›</button></header><div className="week-head">{['Lun 21','Mar 22','Mer 23','Jeu 24','Ven 25'].map(x=><b key={x}>{x}</b>)}</div><div className="week-grid">{[0,1,2,3,4].map(d=><div key={d}>{d!==1&&<article className={`event e${d}`}><small>{9+d}:30</small><b>{talentRows[d]?.[0]||'Sophie Martin'}</b><span>{d%2?'Visio':'Bureau'} · 45 min</span></article>}{d===2&&<article className="event second"><small>15:00</small><b>Thomas Bernard</b><span>Technique · 60 min</span></article>}</div>)}</div></div><aside className="panel interview-list"><Title t="À venir" link="Voir l’agenda"/>{talentRows.slice(0,4).map((p,n)=><p key={p[0]}><time><b>{21+n}</b><small>SEP</small></time><span><b>{p[0]}</b><small>{p[1]} · {n+9}:30</small></span><button onClick={()=>toast(`Visioconférence avec ${p[0]}`)}><I.Video/></button></p>)}</aside></section></div>;
  return <div><ModuleHero eyebrow="INSIGHTS" title="Analytics recrutement" subtitle="Mesurez la performance, les délais et la qualité de vos recrutements." action="Exporter le rapport" Icon={I.ChartNoAxesCombined} onAction={()=>toast('Export du rapport analytics lancé')}/><section className="analytics-kpis"><div><small>TIME TO HIRE</small><b>24 jours</b><em>↓ 3 jours</em></div><div><small>TAUX DE CONVERSION</small><b>18,7%</b><em>↑ 2,3 pts</em></div><div><small>COÛT PAR RECRUTEMENT</small><b>1 280 €</b><em>↓ 8%</em></div><div><small>SATISFACTION CLIENT</small><b>4,8 / 5</b><em>↑ 0,2</em></div></section><section className="analytics-grid"><div className="panel"><Title t="Performance du funnel" link="6 derniers mois"/><div className="funnel">{[['Candidats','1 248',100],['Qualifiés','486',72],['Entretiens','184',48],['Offres','42',28],['Placements','31',20]].map(x=><p key={x[0]}><span>{x[0]}</span><i style={{width:`${x[2]}%`}}/><b>{x[1]}</b></p>)}</div></div><div className="panel source-chart"><Title t="Sources des meilleurs candidats"/><div className="donut"><strong>1 248<small>candidats</small></strong></div>{[['Cooptation','38%'],['Job boards','29%'],['Sourcing IA','21%'],['Candidatures','12%']].map(x=><p key={x[0]}><i/><span>{x[0]}</span><b>{x[1]}</b></p>)}</div></section></div>;
}

function ModuleHero({eyebrow,title,subtitle,action,Icon,onAction}:{eyebrow:string;title:string;subtitle:string;action:string;Icon:any;onAction?:()=>void}) {
  return <header className="module-hero"><div><small>{eyebrow}</small><h1>{title}</h1><p>{subtitle}</p></div><button className="action primary" onClick={onAction}><Icon/>{action}</button></header>
}
const cols = [
  ['Nouveaux', '142', 'blue'],
  ['Préqualification', '68', 'blue'],
  ['Entretien', '36', 'orange'],
  ['Shortlist', '18', 'violet'],
  ['Offre', '7', 'green'],
  ['Recruté', '9', 'green'],
];
function AdminDashboard() {
  return (
    <>
      <Head admin />
      <section className="stats">
        <Stat
          Icon={I.BriefcaseBusiness}
          label="Offres actives"
          value="24"
          delta="+3"
        />
        <Stat
          Icon={I.Users}
          label="Candidats"
          value="1 248"
          delta="+128"
          n={1}
        />
        <Stat
          Icon={I.CalendarDays}
          label="Entretiens planifiés"
          value="36"
          delta="+6"
          n={2}
        />
        <Stat
          Icon={I.ChartNoAxesCombined}
          label="Taux de conversion"
          value="18,7%"
          delta="+2,3 pts"
          n={3}
        />
        <Stat
          Icon={I.Clock3}
          label="Temps moyen de recrutement"
          value="24 jours"
          delta="−3 jours"
          n={4}
        />
      </section>
      <div className="panel pipeline">
        <Title t="Pipeline de recrutement" link="Voir tout le pipeline →" />
        <div className="pipecols">
          {cols.map((c, n) => (
            <div className={'pipe ' + c[2]} key={c[0]}>
              <header>
                <b>{c[0]}</b>
                <strong>{c[1]}</strong>
              </header>
              {people.slice(n * 3, n * 3 + 3).map((p, k) => (
                <p key={p}>
                  <i>
                    {p
                      .split(' ')
                      .map((x) => x[0])
                      .join('')}
                  </i>
                  <span>
                    <b>{p}</b>
                    <small>
                      {['Data Analyst', 'Data Engineer', 'Product Manager'][k]}
                      <br />
                      Score {72 + k * 6}%
                    </small>
                  </span>
                </p>
              ))}
              <button>+ {Math.max(+c[1] - 3, 5)} autres</button>
            </div>
          ))}
        </div>
      </div>
      <section className="adminthree">
        <div className="panel recent">
          <Title t="Activité récente" link="Voir toute l’activité →" />
          {[
            'Nouvelle offre publiée',
            'Entretien planifié',
            'Email envoyé',
            'Nouveau candidat ajouté',
            'Candidat recruté',
          ].map((x, n) => (
            <p key={x}>
              <i>▣</i>
              <span>
                <b>{x}</b>
                <small>{people[n + 6]} – Data Engineer</small>
              </span>
              <small>Il y a {n + 1}h</small>
            </p>
          ))}
        </div>
        <div className="panel candidates">
          <Title t="Top candidats" link="Voir tous les candidats →" />
          {people.slice(9, 14).map((p, n) => (
            <p key={p}>
              <i>{n + 1}</i>
              <b className="avatar">
                {p
                  .split(' ')
                  .map((x) => x[0])
                  .join('')}
              </b>
              <span>
                <b>{p}</b>
                <small>Data Scientist – ACME Corp</small>
              </span>
              <strong>{92 - n * 4}%</strong>
            </p>
          ))}
        </div>
        <div className="panel recruit">
          <Title
            t="Analyse des recrutements"
            link="Voir le rapport complet →"
          />
          <div>
            {[
              ['Candidats entrants', '342'],
              ['Entretiens réalisés', '78'],
              ['Offres acceptées', '14'],
              ['Recrutements', '9'],
            ].map((x) => (
              <span key={x[0]}>
                {x[0]}
                <b>
                  {x[1]} <i>+18%</i>
                </b>
              </span>
            ))}
          </div>
          <Chart />
        </div>
      </section>
    </>
  );
}

function AdminConsole({tab,toast}:{tab:string;toast:(x:string)=>void}) {
  if(tab==='Tableau de bord') return <div><header className="admin-hero"><div><small>NEXORA CONTROL CENTER</small><h1>Bonjour Marc, tout fonctionne normalement.</h1><p>Vue temps réel de la plateforme, des organisations et des opérations IA.</p></div><span><i/>Tous les systèmes opérationnels</span></header><section className="admin-kpis"><div><I.Users/><span><small>UTILISATEURS ACTIFS</small><b>2 847</b><em>+12,4%</em></span></div><div><I.Building2/><span><small>ORGANISATIONS</small><b>186</b><em>+18</em></span></div><div><I.CreditCard/><span><small>MRR</small><b>48 620 €</b><em>+8,7%</em></span></div><div><I.Bot/><span><small>ACTIONS IA</small><b>18 429</b><em>99,2%</em></span></div></section><section className="admin-grid"><div className="panel platform-growth"><Title t="Croissance de la plateforme" link="12 derniers mois"/><div className="growth-chart">{[32,38,35,47,52,61,58,72,78,82,91,96].map((x,n)=><i key={n} style={{height:`${x}%`}}><span>{n===11?'2 847':''}</span></i>)}</div><footer><span><i className="purple"/>Utilisateurs</span><span><i className="cyan"/>Organisations</span></footer></div><div className="panel system-health"><Title t="Santé des services" link="Status page"/>{[['API principale','99,99%','24 ms'],['Nexora AI','99,92%','840 ms'],['Automations','99,97%','128 ms'],['Emails','99,88%','1,2 s']].map((x,n)=><p key={x[0]}><i className={n===3?'warn':''}/><span><b>{x[0]}</b><small>Opérationnel</small></span><strong>{x[1]}</strong><em>{x[2]}</em></p>)}</div><div className="panel admin-activity"><Title t="Activité plateforme" link="Journal complet"/>{[['Nouvelle organisation','DataNova a rejoint Nexora'],['Upgrade abonnement','ACME passe au plan Business'],['Pic d’usage IA','2 400 analyses en 1 heure'],['Nouveau membre','48 utilisateurs invités']].map((x,n)=><p key={x[0]}><i>{[<I.Building2 key="a"/>,<I.CreditCard key="b"/>,<I.Bot key="c"/>,<I.UserPlus key="d"/>][n]}</i><span><b>{x[0]}</b><small>{x[1]}</small></span><time>{n+1}h</time></p>)}</div></section></div>;
  const configs:Record<string,{eyebrow:string;title:string;subtitle:string;items:string[][]}> = {
    'Offres':{eyebrow:'CONTENU',title:'Offres de la plateforme',subtitle:'Supervisez la qualité et la diffusion des postes.',items:[['Data Analyst','ACME Corp','Active','142 vues'],['Data Engineer','Orange','Active','98 vues'],['Product Manager','GreenTech','À vérifier','76 vues'],['BI Analyst','Sopra Steria','Suspendue','54 vues']]},
    'Candidats':{eyebrow:'UTILISATEURS',title:'Candidats',subtitle:'Gérez les comptes, la conformité et l’activité.',items:[['Sophie Martin','sophie@demo.fr','Premium','Active'],['Thomas Bernard','thomas@demo.fr','Free','Active'],['Fatou Diop','fatou@demo.fr','Premium','Active'],['Mehdi Benali','mehdi@demo.fr','Free','À vérifier']]},
    'Clients':{eyebrow:'ORGANISATIONS',title:'Entreprises clientes',subtitle:'Abonnements, sièges et santé des comptes.',items:[['ACME Corp','Business','24 sièges','4 800 € MRR'],['Orange','Enterprise','82 sièges','12 400 € MRR'],['GreenTech','Pro','8 sièges','1 200 € MRR'],['Sopra Steria','Business','36 sièges','6 900 € MRR']]},
    'Entretiens':{eyebrow:'ACTIVITÉ',title:'Entretiens',subtitle:'Volume et qualité des rendez-vous organisés.',items:[['Sophie Martin','ACME Corp','25 sept.','Confirmé'],['Thomas Bernard','Orange','26 sept.','Confirmé'],['Fatou Diop','GreenTech','27 sept.','En attente'],['Mehdi Benali','ACME Corp','28 sept.','Confirmé']]},
    'Emails & Automations':{eyebrow:'OPERATIONS',title:'Emails & automatisations',subtitle:'Surveillez les exécutions et incidents.',items:[['Relance candidature','1 284 exécutions','99,7%','Active'],['Job Watcher','8 420 exécutions','99,9%','Active'],['Scoring candidat','4 821 exécutions','99,2%','Active'],['LinkedIn Watcher','0 exécution','—','Pause']]},
    'Statistiques':{eyebrow:'BUSINESS INTELLIGENCE',title:'Statistiques globales',subtitle:'Indicateurs consolidés de toute la plateforme.',items:[['Utilisateurs actifs','2 847','+12,4%','30 jours'],['Candidatures créées','18 429','+18,2%','30 jours'],['Placements','384','+7,8%','30 jours'],['Revenu récurrent','48 620 €','+8,7%','Mensuel']]},
    'Pipeline':{eyebrow:'PLATEFORME',title:'Pipeline global',subtitle:'Toutes les étapes de recrutement consolidées.',items:[['Nouveaux','1 248','100%','Entrée'],['Qualifiés','486','38,9%','Conversion'],['Entretiens','184','14,7%','Conversion'],['Placements','31','2,5%','Conversion']]},
  };
  const view=configs[tab]||configs['Statistiques'];
  return <div><ModuleHero eyebrow={view.eyebrow} title={view.title} subtitle={view.subtitle} action="Exporter" Icon={I.Download} onAction={()=>toast(`Export de « ${view.title} » lancé`)}/><section className="panel admin-table"><header><label><I.Search/><input placeholder={`Rechercher dans ${tab.toLowerCase()}...`}/></label><button onClick={()=>toast('Filtres appliqués')}><I.Filter/>Filtrer</button><button className="action primary" onClick={()=>toast('Nouvel élément créé')}><I.Plus/>Ajouter</button></header>{view.items.map((x,n)=><article key={x[0]}><i>{x[0].slice(0,2).toUpperCase()}</i><span><b>{x[0]}</b><small>ID NX-{2400+n}</small></span><strong>{x[1]}</strong><em>{x[2]}</em><small>{x[3]}</small><button onClick={()=>toast(`${x[0]} ouvert`)}><I.MoreHorizontal/></button></article>)}</section></div>;
}

// Résumé compact et RÉEL (pas de chiffres inventés) des données
// actuellement enregistrées, envoyé comme contexte à l'assistant. Reste
// volontairement court pour limiter le coût/latence de l'appel Gemini.
function buildAssistantContext(mode: Mode, offers: StoredOffer[], apps: Application[], flows: AutomationFlow[]): string {
  const activeOffers = offers.filter((o) => o.status === 'active' || o.status === 'expiring_soon');
  const topOffers = [...activeOffers]
    .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
    .slice(0, 5)
    .map((o) => `${o.title} chez ${o.company} (${o.location}, ${STATUS_LABEL[o.status]})`);
  const appsByStage = apps.reduce<Record<string, number>>((acc, a) => {
    acc[a.stage] = (acc[a.stage] || 0) + 1;
    return acc;
  }, {});
  const activeFlows = flows.filter((f) => f.status === 'active');
  const lines = [
    `Offres enregistrées : ${offers.length} au total (${activeOffers.length} actives ou bientôt expirées).`,
    topOffers.length ? `Offres récentes : ${topOffers.join(' ; ')}.` : '',
    `Candidatures (${apps.length}) par statut : ${Object.entries(appsByStage).map(([s, n]) => `${s}: ${n}`).join(', ') || 'aucune'}.`,
    `Automatisations actives : ${activeFlows.length}/${flows.length} (${activeFlows.map((f) => f.name).join(', ') || 'aucune'}).`,
  ];
  return lines.filter(Boolean).join('\n');
}

function NexoraAssistant({mode,onClose,toast}:{mode:Mode;onClose:()=>void;toast:(x:string)=>void}) {
  const [query,setQuery] = useState('');
  const [answer,setAnswer] = useState('');
  const [loading,setLoading] = useState(false);
  const [source,setSource] = useState<'gemini'|'demo'|null>(null);
  const [offers] = useStored<StoredOffer[]>('jobpilot_offers_v3', initialOffers);
  const [apps] = useStored<Application[]>('jobpilot_apps', seedApps);
  const [flows] = useStored<AutomationFlow[]>('nexora_automation_flows_v2', seedFlows);
  const suggestions = mode === 'candidate'
    ? ['Quelles candidatures dois-je relancer ?', 'Pourquoi je n’obtiens pas plus d’entretiens ?', 'Trouve mes meilleures offres cette semaine']
    : ['Quels candidats dois-je contacter ?', 'Quels clients faut-il relancer ?', 'Résume mon pipeline de recrutement'];
  // Repli hors-ligne (utilisé uniquement si la clé Gemini n'est pas
  // configurée ou si l'appel échoue) : réponses de démonstration, jamais
  // présentées comme provenant d'un vrai modèle.
  function demoAnswer(text:string){
    const q=text.toLowerCase();
    if(q.includes('relanc')) return 'J’ai trouvé 4 candidatures sans réponse : ACME (9 jours), Orange (12 jours), Capgemini (8 jours) et Sopra Steria (14 jours). Je peux préparer les 4 relances personnalisées.';
    if(q.includes('entretien')) return 'Sur 41 candidatures, 63 % demandent AWS alors que cette compétence est absente du CV. Les offres Data Analyst ont néanmoins un taux de réponse 2,1× supérieur. Je recommande de renforcer AWS et de concentrer les prochaines candidatures sur ce rôle.';
    if(q.includes('client')) return 'GreenTech et Sopra Steria sont à relancer aujourd’hui. GreenTech a consulté la shortlist il y a 5 jours ; Sopra Steria n’a pas répondu depuis 9 jours.';
    if(q.includes('candidat')) return '4 profils dépassent 85 % de matching. Sophie Martin (92 %) et Thomas Bernard (89 %) sont disponibles immédiatement. Je peux préparer les messages de prise de contact.';
    return 'J’ai croisé les données CRM, les candidatures, le matching et les tâches. Votre priorité est de traiter 3 relances et 2 profils à fort potentiel aujourd’hui.';
  }
  async function ask(text=query){
    setQuery(text);
    setLoading(true);
    try{
      const context = buildAssistantContext(mode, offers, apps, flows);
      const res = await fetch('/api/assistant', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ message:text, mode, context }),
      });
      const data = await res.json().catch(()=>null) as {text?:string} | null;
      if(res.ok && data?.text){
        setAnswer(data.text);
        setSource('gemini');
      } else {
        setAnswer(demoAnswer(text));
        setSource('demo');
      }
    } catch {
      setAnswer(demoAnswer(text));
      setSource('demo');
    } finally {
      setLoading(false);
    }
  }
  return <div className="assistant-backdrop" onClick={onClose}><aside className="assistant" onClick={e=>e.stopPropagation()}><header><div className="ai-orb"><I.Sparkles/></div><span><b>Ask Nexora</b><small>{source==='gemini'?'Connecté à Gemini · analyse en direct':source==='demo'?'Mode démonstration · Gemini indisponible':'Assistant connecté à vos données'}</small></span><button onClick={onClose}><I.X/></button></header><div className="assistant-body"><div className="assistant-welcome"><I.Bot/><h2>Comment puis-je vous aider ?</h2><p>Je peux analyser vos offres, candidatures, clients et workflows pour vous proposer la prochaine meilleure action.</p></div>{!answer&&!loading&&<div className="suggestions">{suggestions.map(x=><button key={x} onClick={()=>ask(x)}>{x}<I.ArrowUpRight/></button>)}</div>}{loading&&<div className="ai-answer loading"><small>NEXORA RÉFLÉCHIT…</small><p><I.LoaderCircle className="spin"/> Analyse de vos données en cours.</p></div>}{!loading&&answer&&<div className="ai-answer"><small>{source==='gemini'?'RÉPONSE GEMINI':'ANALYSE NEXORA (DÉMO)'}</small><p>{answer}</p><div><button onClick={()=>toast('Éléments liés affichés')}>Voir les éléments</button><button className="primary" onClick={()=>{toast('Actions préparées par Nexora');onClose()}}>Préparer les actions</button></div></div>}</div><footer><div><input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!loading&&ask()} placeholder="Demandez quelque chose à Nexora…" disabled={loading}/><button onClick={()=>ask()} disabled={loading}><I.ArrowUp/></button></div><small>Nexora peut faire des erreurs. Vérifiez les actions importantes.</small></footer></aside></div>
}
export default function Home() {
  let [mode, setMode] = useState<Mode>('candidate');
  let [tab, setTab] = useState<string>('Tableau de bord');
  let [notice, setNotice] = useState('');
  let [external, setExternal] = useState<any[]>([]);
  let [assistant, setAssistant] = useState(false);
  const consumed = useRef(false);
  const mainRef = useRef<HTMLElement>(null);
  function toast(x: string) {
    consumed.current = true;
    setNotice(x);
    window.setTimeout(() => setNotice(''), 2600);
  }
  // Filet de sécurité : garantit qu'aucun bouton/lien ne reste sans réaction.
  // S'exécute après les handlers explicites (phase bubble) et ne déclenche un
  // retour que si rien d'autre ne s'est produit (ni toast, ni changement d'écran).
  function ensureFeedback(e: React.MouseEvent) {
    const el = (e.target as HTMLElement).closest(
      'button, a, [role="button"]',
    ) as HTMLElement | null;
    if (!el || el.hasAttribute('disabled')) return;
    if (el.dataset.live === 'true' || el.closest('[data-ask]')) return;
    if (el.closest('.assistant, .assistant-backdrop, .ask-float')) return;
    const label = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const htmlBefore = mainRef.current?.innerHTML.length ?? 0;
    requestAnimationFrame(() =>
      window.setTimeout(() => {
        if (consumed.current) return; // un toast a déjà répondu
        if ((mainRef.current?.innerHTML.length ?? 0) !== htmlBefore) return; // l'écran a changé
        toast(label ? `« ${label.slice(0, 40)} » — démo` : 'Action de démonstration');
      }, 60),
    );
  }
  function applied(j: AppliedOffer) {
    setExternal((v) => [
      ...v,
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        company: j.company,
        role: j.title,
        stage: 'Envoyée',
        score: j.match,
      },
    ]);
  }
  function legacyAction(e: React.MouseEvent) {
    let ask = (e.target as HTMLElement).closest('[data-ask]');
    if (ask) { setAssistant(true); return; }
    if (!['Tableau de bord', 'Mon CV', 'Analyse ATS'].includes(tab)) return;
    let el = (e.target as HTMLElement).closest(
      'button,a',
    ) as HTMLElement | null;
    if (!el || el.dataset.live === 'true') return;
    let text = (el.textContent || '').trim();
    if (el.tagName === 'A') {
      if (text.includes('offres')) setTab("Offres d'emploi");
      else if (text.toLowerCase().includes('kanban'))
        setTab('Mes candidatures');
      else if (text.toLowerCase().includes('analyse')) setTab('Analyse ATS');
      else toast(`${text} ouvert`);
      return;
    }
    if (text.includes('Télécharger')) {
      let blob = new Blob(
        [
          `Rapport Nexora\nUtilisateur : Sophie Martin\nÉcran : ${tab}\nGénéré le ${new Date().toLocaleDateString('fr-FR')}`,
        ],
        { type: 'text/plain' },
      );
      let a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Nexora-${tab.replaceAll(' ', '-')}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Téléchargement lancé');
    } else if (text.includes('Optimiser') || text.includes('Générer'))
      toast('Version personnalisée générée avec les données du profil');
    else if (text.includes('nouvelle version'))
      toast('Nouvelle version du CV créée');
    else if (text.includes('Nouvelle recherche')) setTab("Offres d'emploi");
    else if (text.includes('Changer')) toast('Sélecteur d’offre ouvert');
    else if (text.includes('Premium')) toast('Page des offres Premium ouverte');
    else toast(`${text || 'Action'} activé`);
  }
  let candidatePage =
    tab === 'Mon CV' ? (
      <CandidateCV />
    ) : tab === 'Analyse ATS' ? (
      <CandidateATS />
    ) : tab === "Offres d'emploi" ? (
      <JobsPage toast={toast} onApplied={applied} />
    ) : tab === 'Matching IA' ? (
      <MatchingPage toast={toast} onApplied={applied} />
    ) : tab === 'Mes candidatures' ? (
      <ApplicationsPage toast={toast} external={external} />
    ) : tab === 'Relances' ? (
      <FollowupsPage toast={toast} />
    ) : tab === 'Documents' ? (
      <DocumentsPage toast={toast} />
    ) : tab === 'Automatisations' ? (
      <AutomationsPage toast={toast} />
    ) : (
      <Candidate />
    );
  let recruiterPage = tab === 'CRM' ? <CRMPage toast={toast}/> : tab === 'Automatisations' ? <AutomationsPage toast={toast}/> : tab === 'Tableau de bord' ? <RecruiterDashboard setTab={setTab}/> : <RecruiterModule tab={tab} toast={toast}/>;
  return (
    // Conteneur de délégation (non interactif en soi) : voir ensureFeedback.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      onClickCapture={() => {
        consumed.current = false;
      }}
      onClick={ensureFeedback}
    >
      <Sidebar mode={mode} setMode={setMode} tab={tab} setTab={setTab} toast={toast} />
      <Top mode={mode} toast={toast} />
      <main ref={mainRef} onClickCapture={legacyAction}>
        {mode === 'candidate' ? candidatePage : mode === 'recruiter' ? recruiterPage : <AdminConsole tab={tab} toast={toast}/>}
      </main>
      <Toast message={notice} />
      <button
        className="ask-float"
        onClick={() => setAssistant(true)}
      >
        <I.Sparkles/> Ask Nexora
      </button>
      {assistant&&<NexoraAssistant mode={mode} onClose={()=>setAssistant(false)} toast={toast}/>}
    </div>
  );
}
