'use client';

import * as I from 'lucide-react';

type PdfTextItem = {
  str?: string;
  transform: number[];
  height?: number;
  fontName?: string;
};

type Key =
  | 'contact'
  | 'profile'
  | 'skills'
  | 'experience'
  | 'education'
  | 'projects'
  | 'languages'
  | 'interests'
  | 'certifications';
export type CVItem = {
  text: string;
  size: number;
  bold: boolean;
  bullet: boolean;
};
export type CVSectionData = {
  key: Key;
  label: string;
  items: CVItem[];
};
export type ParsedCV = {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
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

// Libellés canoniques : structure fixe, identique quel que soit le CV importé.
const LABELS: Record<Key, string> = {
  contact: 'Contact',
  profile: 'Profil',
  experience: 'Expériences professionnelles',
  education: 'Formations',
  skills: 'Compétences',
  projects: 'Projets',
  languages: 'Langues',
  interests: 'Centres d’intérêt',
  certifications: 'Certifications',
};
// Ordre d'affichage fixe dans chaque colonne du modèle.
const MAIN_ORDER: Key[] = ['profile', 'experience', 'education'];
const SIDE_ORDER: Key[] = [
  'skills',
  'projects',
  'certifications',
  'languages',
  'interests',
];
// Détection des titres : insensible aux accents, à la casse et aux variantes.
const CANON: Array<[Key, RegExp]> = [
  ['contact', /^(contact|contacts|coordonnees|informations?( personnelles?)?)$/],
  [
    'profile',
    /^(profil|profile|a ?propos|about( me)?|resume|summary|professional summary|objectif( professionnel)?|accroche|presentation|perfil)$/,
  ],
  [
    'experience',
    /(experiences?( professionnelles?| pro)?|work experience|employment( history)?|parcours professionnel|emplois?|experiencia)/,
  ],
  [
    'education',
    /(formations?|education|diplomes?|etudes|scolarite|parcours (scolaire|academique)|academic|ausbildung|estudios)/,
  ],
  [
    'skills',
    /(competences?|skills?|expertise|technolog|savoir-faire|aptitudes|langages? de programmation|outils|stack|kenntnisse|habilidades)/,
  ],
  ['projects', /(projets?|projects?|realisations?|portfolio|achievements?|proyectos)/],
  ['languages', /^(langues?|languages?|idiomas?|sprachen)$/],
  [
    'interests',
    /(centres? d'? ?interets?|interets?|loisirs?|hobb|interests?|activites)/,
  ],
  [
    'certifications',
    /(certifications?|certificats?|licences?|licenses?|awards?|distinctions?)/,
  ],
];
const skillsList = [
  'Python',
  'R',
  'Scala',
  'Javascript',
  'Typescript',
  'Java',
  'PHP',
  'C++',
  'SQL',
  'NoSQL',
  'MySQL',
  'PostgreSQL',
  'MongoDB',
  'Tensorflow',
  'Keras',
  'Pytorch',
  'Scikit-learn',
  'Pandas',
  'Numpy',
  'BeautifulSoup',
  'Matplotlib',
  'Seaborn',
  'Power BI',
  'Tableau',
  'Plotly',
  'Looker',
  'Excel',
  'ETL',
  'Talend',
  'dbt',
  'KNIME',
  'Snowflake',
  'BigQuery',
  'Databricks',
  'Spark',
  'Airflow',
  'Git',
  'Docker',
  'Kubernetes',
  'Jenkins',
  'AWS',
  'Azure',
  'GCP',
  'Selenium',
  'Flask',
  'React JS',
  'Next JS',
  'Node JS',
  'Machine Learning',
  'Deep Learning',
  'NLP',
  'DevOps',
];

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
<<<<<<< Updated upstream
const norm = (s: string) =>
  clean(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’`´]/g, "'")
    .toLowerCase();
const isUpperish = (s: string) => {
  const letters = s.replace(/[^a-zà-ÿ]/gi, '');
  return letters.length > 2 && letters === letters.toUpperCase();
};

// Transforme les lignes+positions extraites du PDF en structure canonique fixe.
export function structure(all: Line[], fallbackName: string): ParsedCV {
  const sizes = all.map((l) => l.size).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 9;
  // Taille du texte courant (paragraphe) = taille la plus fréquente : sert à
  // distinguer les titres/intitulés (plus grands) des descriptions (puces).
  const freq = new Map<number, number>();
  for (const s of sizes) {
    const k = Math.round(s * 2) / 2;
    freq.set(k, (freq.get(k) || 0) + 1);
=======
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
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const pdf = await getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise,
    all: Line[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p),
      width = page.getViewport({ scale: 1 }).width,
      c = await page.getTextContent();
    for (const i of c.items as PdfTextItem[]) {
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
>>>>>>> Stashed changes
  }
  let bodySize = median;
  let best = 0;
  for (const [k, c] of freq)
    if (c > best || (c === best && k < bodySize)) {
      best = c;
      bodySize = k;
    }

  function headingKey(text: string, size: number): Key | null {
    const prominent =
      size >= median * 1.28 ||
      (isUpperish(text) && size >= median * 1.08 && text.length <= 42);
    if (!prominent) return null;
    const n = norm(text).replace(/\s*[:：].*$/, '').trim();
    for (const [key, rx] of CANON) if (rx.test(n)) return key;
    return null;
  }

  // ---- Champs de contact (indépendants de la mise en page) ----
  const texts = all.map((l) => l.text);
  const joined = texts.join('  ');
  const email = (joined.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || '';
  // Numéro : accepte les formats FR (0670…), US (123-456-7890), internationaux.
  const phone =
    (joined.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{1,4}\)[\s.-]?)?\d{2,4}(?:[\s.-]?\d{2,4}){2,5}/g) ||
      [])
      .map((s) => s.trim())
      .find((s) => {
        const d = s.replace(/\D/g, '');
        return d.length >= 8 && d.length <= 15;
      }) || '';
  const linkedin =
    texts.find((t) => /linkedin\.com|(^|\s|\/)in\/[\w.-]/i.test(t)) || '';
  const github =
    (joined.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[\w.\-/]+/i) ||
      [])[0] || '';
  const website =
    texts.find(
      (t) =>
        /(https?:\/\/|www\.)[^\s]+/i.test(t) && !/linkedin|github/i.test(t),
    ) || '';
  const age = (joined.match(/\b\d{2}\s*ans\b/i) || [])[0] || '';
  const location =
    texts.find((t) =>
      /^[A-ZÀ-Ý][\wà-ÿ' -]+,\s*(France|Belgique|Suisse|Canada|Luxembourg|Maroc)\b/i.test(
        clean(t),
      ),
    ) ||
    texts.find((t) => /\b\d{5}\s+[A-ZÀ-Ý][\wà-ÿ' -]+$/.test(clean(t))) ||
    (joined.match(
      /\d+\s+[A-Za-z][\w.]*(?:\s+[A-Za-z][\w.]*)*?\s+(?:St|Street|Ave|Avenue|Rd|Road|Rue|Blvd|Drive|Dr|Lane|Ln)\b\.?,?\s*[A-Za-z][A-Za-z\s]*?(?=\s*[|]|\s{2,}|$)/i,
    ) || [])[0]?.trim() ||
    '';
  const contactValues = new Set(
    [email, phone, linkedin, github, website, age, location].filter(Boolean),
  );

  // ---- Nom & titre ----
  const notHeading = all.filter((l) => !headingKey(l.text, l.size));
  const nameLine = [...notHeading]
    .filter((l) => l.text.length <= 40 && !contactValues.has(l.text))
    .sort((a, b) => b.size - a.size || b.y - a.y)[0];
  const name = nameLine?.text || fallbackName;
  const title =
    notHeading
      .filter(
        (l) =>
          nameLine &&
          l !== nameLine &&
          l.y < nameLine.y &&
          nameLine.y - l.y < 90 &&
          l.size >= bodySize * 1.02 &&
          l.size < nameLine.size &&
          clean(l.text).length <= 60 &&
          !/[@|]/.test(l.text) &&
          !contactValues.has(l.text),
      )
      .sort((a, b) => b.y - a.y)[0]?.text || '';

  // ---- Sections : lecture par colonne, fusion par clé canonique ----
  const map = new Map<Key, CVItem[]>();
  const skip = new Set([name, title, ...contactValues]);
  for (const column of ['left', 'main'] as const) {
    let current: Key | null = null;
    for (const l of all
      .filter((x) => x.column === column)
      .sort((a, b) => b.y - a.y || a.x - b.x)) {
      const hk = headingKey(l.text, l.size);
      if (hk) {
        current = hk;
        if (!map.has(hk)) map.set(hk, []);
        continue;
      }
      if (!current || current === 'contact') continue;
      if (skip.has(l.text) || !clean(l.text)) continue;
      const hasYear = /\b(19|20)\d{2}\b/.test(l.text);
      const marked = /^[•●▪◦‣·*✓✔]|^[-–—]\s/.test(l.text);
      // Titre = nettement plus grand que le corps, ou ligne courte datée.
      const bold =
        l.size >= bodySize * 1.18 ||
        (hasYear && clean(l.text).length <= 60);
      map.get(current)!.push({
        text: clean(l.text),
        size: l.size,
        bold: bold && !marked,
        // Les descriptions (taille courante, non-titres) deviennent des puces.
        bullet: marked || !bold,
      });
    }
  }
  // Déduplication par section.
  for (const [k, items] of map) {
    const seen = new Set<string>();
    map.set(
      k,
      items.filter((it) => {
        if (seen.has(it.text)) return false;
        seen.add(it.text);
        return true;
      }),
    );
  }

  const skills = skillsList.filter((s) =>
    texts.some((t) => norm(t).includes(norm(s))),
  );
  const order: Key[] = [...MAIN_ORDER, ...SIDE_ORDER];
  const sections = order
    .filter((k) => map.get(k)?.length)
    .map((k) => ({ key: k, label: LABELS[k], items: map.get(k)! }));

  return {
    name,
    title,
    email,
    phone,
    location,
    linkedin,
    github,
    website,
    age,
    skills,
    sections,
  };
}

export async function parseCV(file: File): Promise<ParsedCV> {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
  GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    .promise;
  type Frag = { x: number; str: string; w: number; size: number; font: string };
  const all: Line[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const width = page.getViewport({ scale: 1 }).width;
    const content = await page.getTextContent();
    // Regroupe les fragments d'une même ligne (même y et même colonne).
    const rows = new Map<
      string,
      { y: number; column: 'left' | 'main'; frags: Frag[] }
    >();
    for (const it of content.items as any[]) {
      const str = it.str || '';
      if (!str.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5] - (p - 1) * 2000;
      const size = it.height || Math.abs(it.transform[3]) || 8;
      const column: 'left' | 'main' = x < width * 0.31 ? 'left' : 'main';
      const rowKey = `${Math.round(y / 3)}:${column}`;
      const row = rows.get(rowKey) || { y, column, frags: [] };
      row.frags.push({
        x,
        str,
        w: it.width || str.length * size * 0.5,
        size,
        font: it.fontName || '',
      });
      rows.set(rowKey, row);
    }
    for (const row of rows.values()) {
      row.frags.sort((a, b) => a.x - b.x);
      // Seuil d'espacement : par défaut ~0,3em. Pour un titre en lettres
      // espacées (« E M A A W A R N E R »), on n'insère un espace qu'aux
      // vraies coupures de mots (grands écarts) et on colle les lettres.
      const gaps: number[] = [];
      for (let i = 1; i < row.frags.length; i++)
        gaps.push(row.frags[i].x - (row.frags[i - 1].x + row.frags[i - 1].w));
      const avgLen =
        row.frags.reduce((s, f) => s + f.str.trim().length, 0) /
        row.frags.length;
      const spaced = row.frags.length >= 4 && avgLen <= 1.6;
      let threshold = row.frags[0]?.size * 0.3 || 3;
      if (spaced) {
        const pos = gaps.filter((g) => g > 0).sort((a, b) => a - b);
        const medGap = pos[Math.floor(pos.length / 2)] || 0;
        threshold = Math.max(medGap * 1.9, row.frags[0].size * 0.4);
      }
      // Reconstruit le texte : espace seulement si l'écart le justifie
      // (évite aussi « Cal cul » → « Calcul »).
      let text = '';
      let prevEnd: number | null = null;
      for (const f of row.frags) {
        if (prevEnd !== null && f.x - prevEnd > threshold) text += ' ';
        text += f.str;
        prevEnd = f.x + f.w;
      }
      text = clean(text);
      if (!text) continue;
      // Taille représentative = celle du fragment le plus long (évite qu'un
      // petit fragment plus gros ne fasse passer toute la ligne pour un titre).
      const lead = [...row.frags].sort((a, b) => b.str.length - a.str.length)[0];
      all.push({
        text,
        x: row.frags[0].x,
        y: row.y,
        size: lead.size,
        font: lead.font,
        column: row.column,
      });
    }
  }
  return structure(
    all,
    file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' '),
  );
}

// ---------- Rendu : modèle fixe (identique au CV de référence) ----------
function Entry({ items, skills }: { items: CVItem[]; skills: string[] }) {
  return (
    <div className="faithful-lines">
      {items.map((x, i) =>
        x.bullet ? (
          <li key={`${x.text}-${i}`}>
            {x.text.replace(/^[•●▪◦‣·*✓✔]\s*|^[-–—]\s*/, '')}
          </li>
        ) : x.bold ? (
          <p className="is-bold" key={`${x.text}-${i}`}>
            {x.text}
          </p>
        ) : (
          <li key={`${x.text}-${i}`}>{x.text}</li>
        ),
      )}
      {skills && skills.length > 0 && (
        <div className="import-skills">
          {skills.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}
function Block({ s, skills }: { s: CVSectionData; skills: string[] }) {
  return (
    <section className="cv-section">
      <h4>{s.label}</h4>
      {s.key === 'skills' ? (
        <>
          {skills.length > 0 && (
            <div className="import-skills">
              {skills.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          )}
          <Entry items={s.items} skills={[]} />
        </>
      ) : (
        <Entry items={s.items} skills={[]} />
      )}
    </section>
  );
}

export function ImportedCVSummary({ cv, file }: { cv: ParsedCV; file: File }) {
  const initials = cv.name
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const main = MAIN_ORDER.map((k) =>
    cv.sections.find((s) => s.key === k),
  ).filter(Boolean) as CVSectionData[];
  const side = SIDE_ORDER.map((k) =>
    cv.sections.find((s) => s.key === k),
  ).filter(Boolean) as CVSectionData[];
  const contactLine = [cv.email, cv.phone, cv.location]
    .filter(Boolean)
    .join('　·　');
  const linksLine = [cv.linkedin, cv.github, cv.website]
    .filter(Boolean)
    .join('　·　');

  return (
    <div className="cv-layout imported-cv">
      <aside className="cv-left">
        <section className="panel profile-card">
          <div className="portrait">{initials || 'CV'}</div>
          <div>
            <h3>{cv.name}</h3>
            <b>{cv.title || 'Profil professionnel'}</b>
            {cv.location && (
              <small>
                <I.MapPin /> {cv.location}
              </small>
            )}
          </div>
          <hr />
          {cv.email && (
            <p>
              <I.Mail />
              <span>
                Email<b>{cv.email}</b>
              </span>
            </p>
          )}
          {cv.phone && (
            <p>
              <I.Phone />
              <span>
                Téléphone<b>{cv.phone}</b>
              </span>
            </p>
          )}
          {cv.age && (
            <p>
              <I.UserRound />
              <span>
                Âge<b>{cv.age}</b>
              </span>
            </p>
          )}
          {(cv.linkedin || cv.github || cv.website) && <hr />}
          {cv.linkedin && (
            <p>
              <I.Link2 />
              <span>
                LinkedIn<b className="link">{cv.linkedin}</b>
              </span>
            </p>
          )}
          {cv.github && (
            <p>
              <I.GitBranch />
              <span>
                GitHub<b className="link">{cv.github}</b>
              </span>
            </p>
          )}
          {cv.website && (
            <p>
              <I.Globe />
              <span>
                Portfolio<b className="link">{cv.website}</b>
              </span>
            </p>
          )}
        </section>
        {cv.skills.length > 0 && (
          <section className="panel keyword-card">
            <div className="title">
              <b>Compétences clés détectées</b>
            </div>
            <div>
              {cv.skills.map((x) => (
                <span key={x}>{x}</span>
              ))}
            </div>
          </section>
        )}
        <section className="panel current-file">
          <b>Fichier importé</b>
          <p>
            <i>PDF</i>
            <span>
              <b>{file.name}</b>
              <small>
                {(file.size / 1024).toFixed(0)} Ko · importé maintenant
              </small>
            </span>
          </p>
        </section>
      </aside>

      <article className="cv-paper">
        <header>
          <h2>{cv.name}</h2>
          <h3>{cv.title || 'Profil professionnel'}</h3>
          {contactLine && <p>{contactLine}</p>}
          {linksLine && <p>{linksLine}</p>}
        </header>
        <div className="cv-columns">
          <div className="cv-main">
            {main.length ? (
              main.map((s) => <Block key={s.key} s={s} skills={[]} />)
            ) : (
              <section className="cv-section">
                <p>
                  Aucune expérience ou formation détectée automatiquement dans ce
                  PDF.
                </p>
              </section>
            )}
          </div>
          <aside className="cv-side">
            {side.map((s) => (
              <Block
                key={s.key}
                s={s}
                skills={s.key === 'skills' ? cv.skills : []}
              />
            ))}
          </aside>
        </div>
      </article>

      <aside className="cv-right">
        <section className="panel completeness">
          <div className="title">
            <b>Structure reconnue</b>
          </div>
          <div>
            <strong>{cv.sections.length}</strong>
            <span>
              <b>rubriques mappées</b>
              <p>
                {cv.skills.length} compétences techniques
                <br />
                Mise en page normalisée au modèle Nexora.
              </p>
            </span>
          </div>
        </section>
        <section className="panel suggestions">
          <div className="title">
            <b>Rubriques du modèle</b>
          </div>
          {(['profile', 'experience', 'education', 'skills', 'projects', 'languages', 'interests', 'certifications'] as Key[]).map(
            (k) => {
              const found = cv.sections.some((s) => s.key === k);
              return (
                <p key={k}>
                  <i>{found ? '✓' : '○'}</i>
                  <span>
                    <b>{LABELS[k]}</b>
                    <small>{found ? 'Détectée' : 'Non présente'}</small>
                  </span>
                </p>
              );
            },
          )}
        </section>
      </aside>
    </div>
  );
}
