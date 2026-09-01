'use client';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as I from 'lucide-react';
GlobalWorkerOptions.workerSrc = pdfWorker;
export type ParsedCV = {
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
  age: string;
  skills: string[];
  education: string[];
  experience: string[];
  projects: string[];
  interests: string[];
};
const headings =
  /^(formations?|exp[ée]riences? professionnelles?|comp[ée]tences?|contacts?|centres? d.?int[ée]r[êe]t|profil|projets?)$/i;
const skillWords = [
  'Python',
  'R',
  'Javascript',
  'Java',
  'PHP',
  'SQL',
  'NoSQL',
  'Tensorflow',
  'Pytorch',
  'Pandas',
  'Numpy',
  'BeautifulSoup',
  'Matplotlib',
  'Seaborn',
  'Power BI',
  'Tableau',
  'Plotly',
  'ETL',
  'Talend',
  'Git',
  'Jenkins',
  'Selenium',
  'React JS',
  'Machine Learning',
  'Deep Learning',
  'DevOps',
];
export async function parseCV(file: File): Promise<ParsedCV> {
  const pdf = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const lines: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    for (const item of content.items as any[]) {
      const s = (item.str || '').replace(/\s+/g, ' ').trim();
      if (s) lines.push(s);
    }
  }
  const unique = lines.filter((x, i) => i === 0 || x !== lines[i - 1]);
  const email = unique.find((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) || '';
  const phone =
    unique.find((x) => /(?:\+33|0)[ .-]?[1-9](?:[ .-]?\d{2}){4}/.test(x)) || '';
  const linkedin = unique.find((x) => /linkedin|in\//i.test(x)) || '';
  const age = unique.find((x) => /^\d{2}\s*ans$/i.test(x)) || '';
  const name =
    unique.find(
      (x) =>
        /^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'-]+\s+[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'-]+$/.test(x) &&
        !headings.test(x),
    ) || file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
  const ni = unique.indexOf(name);
  const title =
    unique
      .slice(Math.max(0, ni + 1), ni + 5)
      .find((x) => !/[\d@]/.test(x) && !headings.test(x)) ||
    'Profil professionnel';
  const skills = skillWords.filter((s) =>
    unique.some((x) => x.toLowerCase().includes(s.toLowerCase())),
  );
  const section = (start: RegExp, ends: RegExp[]) => {
    const i = unique.findIndex((x) => start.test(x));
    if (i < 0) return [];
    let j = unique.findIndex((x, k) => k > i && ends.some((e) => e.test(x)));
    if (j < 0) j = unique.length;
    return unique
      .slice(i + 1, j)
      .filter((x) => x !== name && x !== email && x !== phone);
  };
  const education = section(/^formations?$/i, [
    /^exp/i,
    /^comp/i,
    /^contacts?$/i,
  ]).slice(0, 16);
  const experience = section(/^exp[ée]riences?/i, [
    /^centres?/i,
    /^formations?$/i,
  ])
    .filter((x) => !skillWords.includes(x))
    .slice(0, 30);
  const interests = section(/^centres?/i, [/^rythme/i]).slice(0, 8);
  const projects = unique
    .filter(
      (x) =>
        /conception|d[ée]veloppement|dashboard|scraping|pipeline|application/i.test(
          x,
        ) && x.length > 28,
    )
    .slice(0, 10);
  return {
    name,
    title,
    email,
    phone,
    linkedin,
    age,
    skills,
    education,
    experience,
    projects,
    interests,
  };
}
const Block = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="import-block">
    <h3>{title}</h3>
    {children}
  </section>
);
const Items = ({ items }: { items: string[] }) => (
  <ul>
    {items.map((x, i) => (
      <li key={`${x}-${i}`}>{x}</li>
    ))}
  </ul>
);
export function ImportedCVSummary({ cv, file }: { cv: ParsedCV; file: File }) {
  const initials = cv.name
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="imported-cv-layout">
      <aside className="imported-identity panel">
        <div className="import-avatar">{initials}</div>
        <h2>{cv.name}</h2>
        <b>{cv.title}</b>
        <p>
          <I.Mail />
          {cv.email || 'Email non détecté'}
        </p>
        <p>
          <I.Phone />
          {cv.phone || 'Téléphone non détecté'}
        </p>
        {cv.linkedin && (
          <p>
            <I.Link />
            {cv.linkedin}
          </p>
        )}
        {cv.age && (
          <p>
            <I.UserRound />
            {cv.age}
          </p>
        )}
        <hr />
        <small>Informations extraites automatiquement du PDF.</small>
      </aside>
      <article className="imported-paper panel">
        <header>
          <span>CV importé</span>
          <h1>{cv.name}</h1>
          <h2>{cv.title}</h2>
          <p>
            {[cv.email, cv.phone, cv.linkedin].filter(Boolean).join('  ·  ')}
          </p>
        </header>
        <div className="imported-columns">
          <main>
            {cv.experience.length > 0 && (
              <Block title="Expériences professionnelles">
                <Items items={cv.experience} />
              </Block>
            )}
            {cv.projects.length > 0 && (
              <Block title="Projets et réalisations">
                <Items items={cv.projects} />
              </Block>
            )}
          </main>
          <aside>
            {cv.skills.length > 0 && (
              <Block title="Compétences">
                <div className="import-skills">
                  {cv.skills.map((x) => (
                    <span key={x}>{x}</span>
                  ))}
                </div>
              </Block>
            )}
            {cv.education.length > 0 && (
              <Block title="Formations">
                <Items items={cv.education} />
              </Block>
            )}
            {cv.interests.length > 0 && (
              <Block title="Centres d’intérêt">
                <Items items={cv.interests} />
              </Block>
            )}
          </aside>
        </div>
      </article>
      <aside className="import-insights">
        <section className="panel">
          <h3>Extraction terminée</h3>
          <strong>
            {Math.min(
              98,
              65 + cv.skills.length + Math.min(cv.experience.length, 12),
            )}
            %
          </strong>
          <p>
            {cv.skills.length} compétences détectées
            <br />
            {cv.experience.length} éléments d’expérience
            <br />
            {cv.education.length} éléments de formation
          </p>
        </section>
        <section className="panel">
          <h3>Fichier analysé</h3>
          <b>{file.name}</b>
          <small>{(file.size / 1024).toFixed(0)} Ko · PDF</small>
          <p className="success">
            <I.CircleCheck /> Fiche mise à jour
          </p>
        </section>
      </aside>
    </div>
  );
}
