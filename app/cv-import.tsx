'use client';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as I from 'lucide-react';
GlobalWorkerOptions.workerSrc = pdfWorker;
type Key =
  | 'contact'
  | 'profile'
  | 'skills'
  | 'experience'
  | 'education'
  | 'projects'
  | 'languages'
  | 'interests'
  | 'certifications'
  | 'other';
export type CVSectionData = {
  key: Key;
  label: string;
  items: CVItem[];
  column: 'left' | 'main';
  x: number;
};
export type CVItem = {
  text: string;
  size: number;
  bold: boolean;
  indent: number;
  bullet: boolean;
};
export type ParsedCV = {
  name: string;
  title: string;
  email: string;
  phone: string;
  linkedin: string;
  age: string;
  skills: string[];
  sections: CVSectionData[];
};
type Line = {
  text: string;
  x: number;
  y: number;
  size: number;
  font: string;
  column: 'left' | 'main';
};
const aliases: Array<[Key, RegExp, string]> = [
  [
    'contact',
    /^(contact|contacts|coordonn[ée]es|contact details|personal details|datos de contacto|kontaktdaten)$/i,
    'Contact',
  ],
  [
    'profile',
    /^(profil|profile|summary|professional summary|about me|à propos|objective|career objective|resum[ée]|perfil|profilo|kurzprofil)$/i,
    'Profil',
  ],
  [
    'skills',
    /^(comp[ée]tences|comp[ée]tences techniques|skills|technical skills|core skills|expertise|technologies|aptitudes|habilidades|kenntnisse)$/i,
    'Compétences',
  ],
  [
    'experience',
    /^(exp[ée]riences?( professionnelles?)?|professional experience|work experience|employment history|career history|experiencia profesional|berufserfahrung)$/i,
    'Expériences professionnelles',
  ],
  [
    'education',
    /^(formation|formations|education|academic background|studies|parcours acad[ée]mique|estudios|ausbildung)$/i,
    'Formations',
  ],
  [
    'projects',
    /^(projets?( personnels?| professionnels?)?|projects?|personal projects?|r[ée]alisations|achievements|portfolio|proyectos)$/i,
    'Projets personnels',
  ],
  ['languages', /^(langues|languages|idiomas|sprachen)$/i, 'Langues'],
  [
    'interests',
    /^(centres? d.?int[ée]r[êe]t|int[ée]r[êe]ts|hobbies|interests|loisirs|activit[ée]s|intereses|hobbys)$/i,
    'Centres d’intérêt',
  ],
  [
    'certifications',
    /^(certifications?|certificats?|licenses? & certifications?|awards?|distinctions?)$/i,
    'Certifications',
  ],
];
const skillsList = [
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
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
function asHeading(text: string, size: number, median: number) {
  const n = clean(text).replace(/[:：]$/, '');
  for (const [key, rx, label] of aliases) if (rx.test(n)) return { key, label };
  const big = size >= median * 1.42 && n.length < 45 && !/[.@]/.test(n),
    upper =
      size >= median * 1.15 &&
      n === n.toUpperCase() &&
      /[A-ZÀ-Ý]/.test(n) &&
      n.length > 3 &&
      n.length < 38;
  return big || upper
    ? { key: 'other' as Key, label: n.replace(/\b\w/g, (c) => c.toUpperCase()) }
    : null;
}
export async function parseCV(file: File): Promise<ParsedCV> {
  const pdf = await getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise,
    all: Line[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p),
      width = page.getViewport({ scale: 1 }).width,
      c = await page.getTextContent();
    for (const i of c.items as any[]) {
      const text = clean(i.str || '');
      if (text)
        all.push({
          text,
          x: i.transform[4],
          y: i.transform[5] - (p - 1) * 2000,
          size: i.height || Math.abs(i.transform[3]) || 8,
          font: i.fontName || '',
          column: i.transform[4] < width * 0.31 ? 'left' : 'main',
        });
    }
  }
  const sizes = all.map((x) => x.size).sort((a, b) => a - b),
    median = sizes[Math.floor(sizes.length / 2)] || 9,
    sections: CVSectionData[] = [],
    headingFonts = new Set(
      all
        .filter((x) =>
          aliases.some(([, rx]) =>
            rx.test(clean(x.text).replace(/[:：]$/, '')),
          ),
        )
        .map((x) => x.font),
    );
  for (const column of ['left', 'main'] as const) {
    let current: CVSectionData | null = null;
    for (const line of all
      .filter((x) => x.column === column)
      .sort((a, b) => b.y - a.y || a.x - b.x)) {
      const h = asHeading(line.text, line.size, median);
      if (h) {
        current = { ...h, items: [], column, x: line.x };
        sections.push(current);
      } else if (current)
        current.items.push({
          text: line.text,
          size: line.size,
          bold: headingFonts.has(line.font) || line.size >= median * 1.22,
          indent: Math.max(0, Math.min(42, line.x - current.x)),
          bullet: /^[•●▪◦‣✓✔]|^[-–—]\s/.test(line.text),
        });
    }
  }
  const text = all.map((x) => x.text),
    email =
      text
        .find((x) => /[^\s@]+@[^\s@]+\.[^\s@]+/.test(x))
        ?.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] || '',
    phone =
      text.find((x) => /(?:\+33|0)[ .-]?[1-9](?:[ .-]?\d{2}){4}/.test(x)) || '',
    linkedin = text.find((x) => /linkedin|in\//i.test(x)) || '',
    age = text.find((x) => /^\d{2}\s*ans$/i.test(x)) || '',
    name =
      all
        .filter((x) => x.column === 'main' && x.size >= median * 2)
        .sort((a, b) => b.y - a.y)[0]?.text ||
      file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '),
    nameLine = all.find((x) => x.text === name),
    title =
      all
        .filter(
          (x) =>
            x.column === 'main' &&
            (!nameLine || x.y < nameLine.y) &&
            x.size >= median * 1.35 &&
            !asHeading(x.text, x.size, median),
        )
        .sort((a, b) => b.y - a.y)[0]?.text || 'Profil professionnel',
    skills = skillsList.filter((s) =>
      text.some((x) => x.toLowerCase().includes(s.toLowerCase())),
    );
  for (const s of sections)
    s.items = s.items
      .filter(
        (x) => ![name, title, email, phone, linkedin, age].includes(x.text),
      )
      .filter(
        (x, i, a) => x.text && a.findIndex((y) => y.text === x.text) === i,
      );
  return {
    name,
    title,
    email,
    phone,
    linkedin,
    age,
    skills,
    sections: sections.filter((s) => s.items.length),
  };
}
const Items = ({ items }: { items: CVItem[] }) => (
  <div className="faithful-lines">
    {items.map((x, i) =>
      x.bullet ? (
        <li
          className={x.bold ? 'is-bold' : ''}
          style={{ marginLeft: x.indent }}
          key={`${x.text}-${i}`}
        >
          {x.text.replace(/^[•●▪◦‣✓✔-]\s*/, '')}
        </li>
      ) : (
        <p
          className={x.bold ? 'is-bold' : ''}
          style={{
            marginLeft: x.indent,
            fontSize: `${Math.max(9, Math.min(13, x.size * 0.92))}px`,
          }}
          key={`${x.text}-${i}`}
        >
          {x.text}
        </p>
      ),
    )}
  </div>
);
const Section = ({ s, skills }: { s: CVSectionData; skills: string[] }) => (
  <section className={`import-block section-${s.key}`}>
    <h3>{s.label}</h3>
    {s.key === 'skills' ? (
      <>
        <div className="import-skills">
          {skills.map((x) => (
            <span key={x}>{x}</span>
          ))}
        </div>
        <Items
          items={s.items.filter(
            (x) =>
              !skills.some((k) => x.text.toLowerCase() === k.toLowerCase()),
          )}
        />
      </>
    ) : (
      <Items items={s.items} />
    )}
  </section>
);
export function ImportedCVSummary({ cv, file }: { cv: ParsedCV; file: File }) {
  const initials = cv.name
      .split(/\s+/)
      .map((x) => x[0])
      .slice(0, 2)
      .join('')
      .toUpperCase(),
    left = cv.sections.filter(
      (s) => s.column === 'left' && s.key !== 'contact',
    ),
    main = cv.sections.filter(
      (s) => s.column === 'main' && s.key !== 'contact',
    );
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
        <small>Colonnes et rubriques détectées automatiquement.</small>
      </aside>
      <article className="imported-paper panel">
        <header>
          <span>CV structuré</span>
          <h1>{cv.name}</h1>
          <h2>{cv.title}</h2>
          <p>
            {[cv.email, cv.phone, cv.linkedin].filter(Boolean).join('  ·  ')}
          </p>
        </header>
        <div className="imported-columns">
          <main>
            {main.map((s, i) => (
              <Section key={`${s.label}-${i}`} s={s} skills={cv.skills} />
            ))}
          </main>
          <aside>
            {left.map((s, i) => (
              <Section key={`${s.label}-${i}`} s={s} skills={cv.skills} />
            ))}
          </aside>
        </div>
      </article>
      <aside className="import-insights">
        <section className="panel">
          <h3>Structure reconnue</h3>
          <strong>{cv.sections.length}</strong>
          <p>
            rubriques détectées
            <br />
            {cv.skills.length} compétences techniques
            <br />2 colonnes analysées séparément
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
