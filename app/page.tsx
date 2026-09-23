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
} from './candidate-pages';
import { ImportedCVSummary, parseCV, type ParsedCV } from './cv-import';
import { LiveCRMPage } from './features/crm/crm-page';
import { LiveAutomationsPage } from './features/automations/automations-page';
import { NexoraAssistantPanel } from './features/assistant/nexora-assistant';
import { LiveAdminPage } from './features/admin/admin-page';
import { SecurityPage, TeamPage } from './features/admin/team-security-page';
import { useCurrentUser } from './features/auth/auth-gate';
import { CandidateProfilePage } from './features/candidate/profile-page';
import { LiveDashboard } from './features/dashboard/live-dashboard';
import { NotificationBell } from './features/notifications/notification-bell';
import { LiveRecruiterPage } from './features/recruiter/recruiter-pages';
type Mode = 'candidate' | 'recruiter' | 'admin';
const cNav = [
  [I.House, 'Tableau de bord'],
  [I.UserRound, 'Mon profil'],
  [I.FileText, 'Mon CV'],
  [I.Target, 'Analyse ATS'],
  [I.BriefcaseBusiness, "Offres d'emploi"],
  [I.Bot, 'Matching IA'],
  [I.LayoutDashboard, 'Mes candidatures'],
  [I.RefreshCw, 'Relances'],
  [I.Zap, 'Automatisations'],
  [I.FileText, 'Documents'],
  [I.ShieldCheck, 'Sécurité'],
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
  [I.ShieldCheck, 'Sécurité'],
];
const aNav = [
  [I.House, 'Tableau de bord'],
  [I.UsersRound, 'Équipe'],
  [I.ShieldCheck, 'Sécurité'],
  [I.ScrollText, 'Journal d’audit'],
  [I.PlugZap, 'Intégrations'],
  [I.HeartPulse, 'Santé'],
];
function Sidebar({
  mode,
  setMode,
  tab,
  setTab,
  role,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  tab: string;
  setTab: (t: string) => void;
  role: 'OWNER' | 'ADMIN' | 'RECRUITER' | 'CANDIDATE';
}) {
  const nav = mode === 'candidate' ? cNav : mode === 'recruiter' ? rNav : aNav;
  const spaces: Array<[Mode, typeof I.House, string]> = [
    ['candidate', I.UserRound, 'Candidat'],
    ['recruiter', I.Building2, 'Recruteur'],
    ['admin', I.ShieldCheck, 'Admin'],
  ].filter(([space]) => {
    if (space === 'admin') return role === 'OWNER' || role === 'ADMIN';
    if (space === 'recruiter') return role !== 'CANDIDATE';
    return true;
  }) as Array<[Mode, typeof I.House, string]>;
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
        <div>
          {spaces.map(([key, Icon, label]) => (
            <button
              title={`Espace ${label}`}
              className={mode === key ? 'active' : ''}
              onClick={() => selectSpace(key)}
              key={key}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <nav>
        {nav.map(([X, s]) => {
          const Icon = X as typeof I.House;
          const label = s as string;
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
        <div className="help">
          <b>Nexora sécurisé</b>
          <small>Données isolées par organisation</small>
        </div>
      </div>
    </aside>
  );
}
function Top({
  mode,
  user,
}: {
  mode: Mode;
  user: ReturnType<typeof useCurrentUser>;
}) {
  const initials =
    user?.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'NX';
  return (
    <header className="top">
      <I.Menu />
      <span>
        {mode === 'candidate'
          ? 'Espace candidat'
          : mode === 'recruiter'
            ? 'Espace recruteur'
            : 'Administration'}
      </span>
      <NotificationBell />
      <div className="user">
        <i>{initials}</i>
        <span>
          <b>{user?.name || 'Utilisateur Nexora'}</b>
          <small>
            {user?.organizationName} · {user?.role}
          </small>
        </span>
      </div>
    </header>
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
    const selected = files?.[0];
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      setError('Sélectionnez un fichier PDF.');
      return;
    }
    if (selected.size > 5 * 1024 * 1024) {
      setError('Le fichier doit faire au maximum 5 Mo.');
      return;
    }
    if (url) URL.revokeObjectURL(url);
    setFile(selected);
    setUrl(URL.createObjectURL(selected));
    setLoading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', selected);
      const [cv, uploadResponse] = await Promise.all([
        parseCV(selected),
        fetch('/api/documents', { method: 'POST', body }),
      ]);
      const uploadResult = (await uploadResponse.json()) as {
        document?: { id: string };
        error?: { message?: string };
      };
      if (!uploadResponse.ok)
        throw new Error(uploadResult.error?.message ?? 'Archivage impossible');
      if (uploadResult.document?.id)
        await fetch('/api/candidate/profile', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ primaryDocumentId: uploadResult.document.id }),
        });
      setParsed(cv);
    } catch (cause) {
      setParsed(null);
      setError(
        cause instanceof Error
          ? cause.message
          : 'Le CV n’a pas pu être analysé.',
      );
    } finally {
      setLoading(false);
    }
  }
  function clear() {
    if (url) URL.revokeObjectURL(url);
    setFile(null);
    setParsed(null);
    setUrl('');
    setError('');
  }
  return (
    <div className="cv-page">
      <div className="cv-head">
        <div>
          <h1>Mon CV</h1>
          <p>Importez un PDF pour l’analyser et l’archiver dans Nexora.</p>
        </div>
        <div>
          <input
            ref={input}
            hidden
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => void importCV(event.target.files)}
          />
          <button data-live="true" onClick={() => input.current?.click()}>
            <I.Upload /> Importer un CV
          </button>
          {url && (
            <button data-live="true" onClick={() => window.open(url, '_blank')}>
              <I.ExternalLink /> Ouvrir le PDF
            </button>
          )}
          {file && <button onClick={clear}>Retirer l’aperçu</button>}
        </div>
      </div>
      {loading && (
        <div className="cv-import-status">
          <I.LoaderCircle /> Analyse et archivage du CV…
        </div>
      )}
      {error && <div className="cv-import-status error">{error}</div>}
      {parsed && file ? (
        <ImportedCVSummary cv={parsed} file={file} />
      ) : file && url ? (
        <section className="pdf-preview panel">
          <header>
            <div>
              <i>PDF</i>
              <span>
                <b>{file.name}</b>
                <small>{(file.size / 1024).toFixed(0)} Ko</small>
              </span>
            </div>
          </header>
          <iframe title={`Aperçu de ${file.name}`} src={url} />
        </section>
      ) : (
        <section className="panel empty">
          <I.FileUp />
          <h2>Aucun CV importé</h2>
          <p>
            Nexora n’affiche plus de profil fictif. Importez votre propre CV
            pour obtenir une vue structurée et le retrouver dans Documents.
          </p>
          <button
            className="action primary"
            onClick={() => input.current?.click()}
          >
            Choisir un PDF
          </button>
        </section>
      )}
    </div>
  );
}
function CandidateATS() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cv, setCv] = useState<ParsedCV | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function analyze(files: FileList | null) {
    const selected = files?.[0];
    if (!selected) return;
    if (selected.type !== 'application/pdf') {
      setError('Sélectionnez un fichier PDF.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const parsed = await parseCV(selected);
      const sectionKeys = new Set(
        parsed.sections.map((section) => section.key),
      );
      const persistedChecks = [
        {
          label: 'Identité',
          passed: Boolean(parsed.name),
          detail: 'Nom détecté',
        },
        {
          label: 'Titre professionnel',
          passed: Boolean(parsed.title),
          detail: 'Titre détecté',
        },
        {
          label: 'Contact',
          passed: Boolean(parsed.email || parsed.phone),
          detail: 'E-mail ou téléphone',
        },
        {
          label: 'Expérience',
          passed: sectionKeys.has('experience'),
          detail: 'Section structurée',
        },
        {
          label: 'Formation',
          passed: sectionKeys.has('education'),
          detail: 'Section structurée',
        },
        {
          label: 'Compétences',
          passed: parsed.skills.length > 0,
          detail: `${parsed.skills.length} détectée(s)`,
        },
      ];
      const persistedScore = Math.round(
        (persistedChecks.filter((check) => check.passed).length /
          persistedChecks.length) *
          100,
      );
      const body = new FormData();
      body.append('file', selected);
      const uploadResponse = await fetch('/api/documents', {
        method: 'POST',
        body,
      });
      const upload = (await uploadResponse.json()) as {
        document?: { id: string };
        error?: { message?: string };
      };
      if (!uploadResponse.ok)
        throw new Error(upload.error?.message ?? 'Archivage impossible');
      await fetch('/api/candidate/profile/ats-analyses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentId: upload.document?.id,
          score: persistedScore,
          detectedKeywords: parsed.skills,
          checks: persistedChecks,
        }),
      });
      setCv(parsed);
      setFile(selected);
    } catch {
      setCv(null);
      setFile(selected);
      setError('Le texte de ce PDF n’a pas pu être extrait.');
    } finally {
      setLoading(false);
    }
  }
  const sectionKeys = new Set(cv?.sections.map((section) => section.key) ?? []);
  const checks = cv
    ? [
        ['Identité', Boolean(cv.name), 'Nom détecté'],
        ['Titre professionnel', Boolean(cv.title), 'Titre détecté'],
        ['Contact', Boolean(cv.email || cv.phone), 'E-mail ou téléphone'],
        ['Expérience', sectionKeys.has('experience'), 'Section structurée'],
        ['Formation', sectionKeys.has('education'), 'Section structurée'],
        [
          'Compétences',
          cv.skills.length > 0,
          `${cv.skills.length} détectée(s)`,
        ],
      ]
    : [];
  const score = checks.length
    ? Math.round(
        (checks.filter(([, passed]) => passed).length / checks.length) * 100,
      )
    : 0;
  return (
    <div className="ats-page">
      <div className="cv-head ats-head">
        <div>
          <h1>Analyse ATS du CV</h1>
          <p>
            Analyse locale de la structure et des mots-clés réellement extraits
            du PDF.
          </p>
        </div>
        <div>
          <input
            ref={input}
            hidden
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => void analyze(event.target.files)}
          />
          <button className="primary" onClick={() => input.current?.click()}>
            <I.Upload /> Analyser un PDF
          </button>
        </div>
      </div>
      {loading && (
        <div className="cv-import-status">
          <I.LoaderCircle /> Extraction du contenu…
        </div>
      )}
      {error && <div className="cv-import-status error">{error}</div>}
      {!cv ? (
        <section className="panel empty">
          <I.Target />
          <h2>Aucune analyse disponible</h2>
          <p>
            Importez votre CV : aucun score, mot-clé ou conseil fictif ne sera
            affiché.
          </p>
        </section>
      ) : (
        <div className="ats-layout">
          <div className="ats-main">
            <section className="panel ats-overview">
              <div className="title">
                <b>Score de structure</b>
              </div>
              <div className="ats-overview-body">
                <div className="ats-gauge">
                  <strong>{score}%</strong>
                  <b>{score >= 80 ? 'Structure complète' : 'À compléter'}</b>
                  <p>
                    Ce score mesure uniquement les sections détectées. Il ne
                    prédit pas une décision de recrutement.
                  </p>
                </div>
                <div className="criteria">
                  {checks.map(([label, passed, detail]) => (
                    <div className="criterion" key={String(label)}>
                      <i className={passed ? 'green' : 'orange'}>
                        {passed ? <I.Check /> : <I.AlertTriangle />}
                      </i>
                      <b>{label}</b>
                      <strong>{passed ? 'OK' : 'Manquant'}</strong>
                      <small>{detail}</small>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            <section className="panel ats-keywords good-box">
              <div className="title">
                <b>Mots-clés détectés</b>
                <small>{cv.skills.length}</small>
              </div>
              <div>
                {cv.skills.map((skill) => (
                  <span key={skill}>{skill}</span>
                ))}
                {!cv.skills.length && <p>Aucun mot-clé reconnu.</p>}
              </div>
            </section>
            <footer className="ats-foot">
              Fichier analysé : {file?.name}. Vérifiez le résultat avant de
              modifier votre CV.
            </footer>
          </div>
          <aside className="panel ats-compare">
            <h3>Comparer à une offre</h3>
            <p>
              Utilisez le module Matching avec un fournisseur d’offres
              configuré. Nexora ne déduit pas de compétences manquantes sans
              offre source.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const currentUser = useCurrentUser();
  const [mode, setMode] = useState<Mode>('candidate');
  const [tab, setTab] = useState<string>('Tableau de bord');
  const [notice, setNotice] = useState('');
  const [assistant, setAssistant] = useState(false);
  function toast(x: string) {
    setNotice(x);
    window.setTimeout(() => setNotice(''), 2600);
  }
  const candidatePage =
    tab === 'Sécurité' ? (
      <SecurityPage toast={toast} />
    ) : tab === 'Mon profil' ? (
      <CandidateProfilePage toast={toast} />
    ) : tab === 'Mon CV' ? (
      <CandidateCV />
    ) : tab === 'Analyse ATS' ? (
      <CandidateATS />
    ) : tab === "Offres d'emploi" ? (
      <JobsPage toast={toast} />
    ) : tab === 'Matching IA' ? (
      <MatchingPage toast={toast} />
    ) : tab === 'Mes candidatures' ? (
      <ApplicationsPage toast={toast} />
    ) : tab === 'Relances' ? (
      <FollowupsPage toast={toast} />
    ) : tab === 'Documents' ? (
      <DocumentsPage toast={toast} />
    ) : tab === 'Automatisations' ? (
      <LiveAutomationsPage toast={toast} />
    ) : (
      <LiveDashboard
        mode="candidate"
        user={currentUser}
        openApplications={() => setTab('Mes candidatures')}
      />
    );
  const recruiterPage =
    tab === 'Sécurité' ? (
      <SecurityPage toast={toast} />
    ) : tab === 'CRM' ? (
      <LiveCRMPage toast={toast} />
    ) : tab === 'Automatisations' ? (
      <LiveAutomationsPage toast={toast} />
    ) : tab === 'Tableau de bord' ? (
      <LiveDashboard
        mode="recruiter"
        user={currentUser}
        openApplications={() => setTab('CRM')}
      />
    ) : (
      <LiveRecruiterPage tab={tab} toast={toast} />
    );
  return (
    <div>
      <Sidebar
        mode={mode}
        setMode={setMode}
        tab={tab}
        setTab={setTab}
        role={currentUser?.role ?? 'CANDIDATE'}
      />
      <Top mode={mode} user={currentUser} />
      <main>
        {mode === 'candidate' ? (
          candidatePage
        ) : mode === 'recruiter' ? (
          recruiterPage
        ) : tab === 'Équipe' ? (
          <TeamPage toast={toast} />
        ) : tab === 'Sécurité' ? (
          <SecurityPage toast={toast} />
        ) : (
          <LiveAdminPage tab={tab} />
        )}
      </main>
      <Toast message={notice} />
      <button className="ask-float" onClick={() => setAssistant(true)}>
        <I.Sparkles /> Ask Nexora
      </button>
      {assistant && (
        <NexoraAssistantPanel mode={mode} onClose={() => setAssistant(false)} />
      )}
    </div>
  );
}
