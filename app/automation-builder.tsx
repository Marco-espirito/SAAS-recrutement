'use client';
import { useState } from 'react';
import * as I from 'lucide-react';

// ---------------------------------------------------------------------
// Catalogue : déclencheurs, champs disponibles par déclencheur, opérateurs
// et actions. C'est ce catalogue qui pilote le constructeur visuel.
// ---------------------------------------------------------------------
export type FieldType = 'number' | 'text' | 'select';
export type FieldDef = { key: string; label: string; type: FieldType; options?: string[]; unit?: string };
export type TriggerDef = {
  kind: string;
  label: string;
  description: string;
  fields: FieldDef[];
  sample: Record<string, string | number>;
};
export type OperatorDef = { key: string; label: string; types: FieldType[] };
export type ActionParamDef = { key: string; label: string; type: 'text' | 'select'; options?: string[] };
export type ActionDef = { kind: string; label: string; params: ActionParamDef[] };

export const OPERATORS: OperatorDef[] = [
  { key: 'eq', label: 'est égal à', types: ['text', 'select', 'number'] },
  { key: 'neq', label: 'est différent de', types: ['text', 'select', 'number'] },
  { key: 'contains', label: 'contient', types: ['text'] },
  { key: 'gt', label: 'est supérieur à', types: ['number'] },
  { key: 'gte', label: 'est supérieur ou égal à', types: ['number'] },
  { key: 'lt', label: 'est inférieur à', types: ['number'] },
  { key: 'lte', label: 'est inférieur ou égal à', types: ['number'] },
];

export const TRIGGERS: TriggerDef[] = [
  {
    kind: 'new_offer',
    label: 'Nouvelle offre détectée',
    description: 'Se déclenche quand une offre correspondant à vos critères est ajoutée ou mise à jour.',
    fields: [
      { key: 'match', label: 'Score de matching', type: 'number', unit: '%' },
      { key: 'location', label: 'Localisation', type: 'text' },
      { key: 'contract', label: 'Type de contrat', type: 'select', options: ['CDI', 'CDD', 'Alternance', 'Stage', 'Intérim'] },
      { key: 'remote', label: 'Mode de travail', type: 'select', options: ['Sur site', 'Hybride', 'Télétravail complet'] },
    ],
    sample: { match: 88, location: 'Lyon, France', contract: 'CDI', remote: 'Hybride' },
  },
  {
    kind: 'application_sent',
    label: 'Candidature envoyée',
    description: 'Se déclenche après l’envoi d’une candidature.',
    fields: [
      { key: 'daysSince', label: 'Jours depuis l’envoi', type: 'number', unit: 'j' },
      { key: 'stage', label: 'Statut', type: 'select', options: ['Envoyée', 'Relance', 'Entretien', 'Offre', 'Refusée'] },
      { key: 'company', label: 'Entreprise', type: 'text' },
    ],
    sample: { daysSince: 7, stage: 'Envoyée', company: 'ACME Corp' },
  },
  {
    kind: 'no_response',
    label: 'Aucune réponse reçue',
    description: 'Se déclenche quand une candidature reste sans réponse.',
    fields: [
      { key: 'daysSince', label: 'Jours sans réponse', type: 'number', unit: 'j' },
      { key: 'channel', label: 'Canal initial', type: 'select', options: ['Email', 'LinkedIn', 'Formulaire'] },
    ],
    sample: { daysSince: 9, channel: 'Email' },
  },
  {
    kind: 'candidate_added',
    label: 'Nouveau candidat ajouté',
    description: 'Se déclenche à l’ajout d’un candidat au vivier (côté recruteur).',
    fields: [
      { key: 'cvComplete', label: 'CV complet', type: 'select', options: ['Oui', 'Non'] },
      { key: 'score', label: 'Score de qualification', type: 'number', unit: '%' },
    ],
    sample: { cvComplete: 'Oui', score: 82 },
  },
];

export const ACTIONS_CATALOG: ActionDef[] = [
  {
    kind: 'send_message',
    label: 'Envoyer un message',
    params: [
      { key: 'channel', label: 'Canal', type: 'select', options: ['Email', 'LinkedIn'] },
      { key: 'template', label: 'Message', type: 'text' },
    ],
  },
  {
    kind: 'add_to_pipeline',
    label: 'Ajouter au pipeline',
    params: [{ key: 'stage', label: 'Étape', type: 'select', options: ['Nouveaux', 'Qualifiés', 'Entretien', 'Offre'] }],
  },
  {
    kind: 'create_task',
    label: 'Créer une tâche',
    params: [{ key: 'title', label: 'Intitulé de la tâche', type: 'text' }],
  },
  {
    kind: 'tag',
    label: 'Ajouter une étiquette',
    params: [{ key: 'tag', label: 'Étiquette', type: 'text' }],
  },
  {
    kind: 'notify',
    label: 'Notifier l’équipe',
    params: [{ key: 'message', label: 'Message', type: 'text' }],
  },
];

// ---------------------------------------------------------------------
// Types de flux : conditions imbriquées (arbre ET/OU), délai, actions.
// ---------------------------------------------------------------------
export type ConditionLeaf = { id: string; kind: 'leaf'; field: string; operator: string; value: string };
export type ConditionGroup = { id: string; kind: 'group'; op: 'AND' | 'OR'; children: ConditionNode[] };
export type ConditionNode = ConditionLeaf | ConditionGroup;
export type AutomationActionInstance = { id: string; kind: string; params: Record<string, string> };
export type AutomationFlow = {
  id: string;
  name: string;
  triggerKind: string;
  conditions: ConditionGroup;
  delay?: { amount: number; unit: 'minutes' | 'heures' | 'jours' };
  actions: AutomationActionInstance[];
  status: 'draft' | 'active' | 'paused';
  createdAt: string;
  executions: number;
  lastRun?: string;
};

let counter = 0;
export function newId(): string {
  counter += 1;
  return `id_${counter}_${Math.random().toString(36).slice(2, 7)}`;
}
export function emptyGroup(): ConditionGroup {
  return { id: newId(), kind: 'group', op: 'AND', children: [] };
}
export function triggerOf(kind: string): TriggerDef {
  return TRIGGERS.find((t) => t.kind === kind) || TRIGGERS[0];
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// ---------------------------------------------------------------------
// Évaluation réelle (moteur de test) : parcourt l'arbre de conditions et
// produit une trace détaillée, feuille par feuille.
// ---------------------------------------------------------------------
export type LeafTrace = { id: string; kind: 'leaf'; label: string; pass: boolean; actual: string };
export type GroupTrace = { id: string; kind: 'group'; op: 'AND' | 'OR'; pass: boolean; children: (LeafTrace | GroupTrace)[] };

function evaluateLeaf(leaf: ConditionLeaf, fields: FieldDef[], record: Record<string, string | number>): LeafTrace {
  const field = fields.find((f) => f.key === leaf.field) || fields[0];
  const opLabel = OPERATORS.find((o) => o.key === leaf.operator)?.label || leaf.operator;
  const actualRaw = record[leaf.field];
  const actual = actualRaw === undefined ? '' : String(actualRaw);
  let pass = false;
  if (field?.type === 'number') {
    const a = Number(actualRaw);
    const v = Number(leaf.value);
    if (leaf.operator === 'eq') pass = a === v;
    else if (leaf.operator === 'neq') pass = a !== v;
    else if (leaf.operator === 'gt') pass = a > v;
    else if (leaf.operator === 'gte') pass = a >= v;
    else if (leaf.operator === 'lt') pass = a < v;
    else if (leaf.operator === 'lte') pass = a <= v;
  } else {
    const a = norm(actual);
    const v = norm(leaf.value);
    if (leaf.operator === 'eq') pass = a === v;
    else if (leaf.operator === 'neq') pass = a !== v;
    else if (leaf.operator === 'contains') pass = v.length > 0 && a.includes(v);
  }
  const unit = field?.type === 'number' && field.unit ? ` ${field.unit}` : '';
  return {
    id: leaf.id,
    kind: 'leaf',
    label: `${field?.label || leaf.field} ${opLabel} « ${leaf.value}${unit} »`,
    pass,
    actual,
  };
}
export function evaluateGroup(
  group: ConditionGroup,
  fields: FieldDef[],
  record: Record<string, string | number>,
): GroupTrace {
  const children = group.children.map((c) =>
    c.kind === 'leaf' ? evaluateLeaf(c, fields, record) : evaluateGroup(c, fields, record),
  );
  const pass = group.children.length === 0 ? true : group.op === 'AND' ? children.every((c) => c.pass) : children.some((c) => c.pass);
  return { id: group.id, kind: 'group', op: group.op, pass, children };
}
export function describeGroup(group: ConditionGroup, fields: FieldDef[]): string {
  if (!group.children.length) return 'aucune condition — se déclenche à chaque occurrence';
  const parts = group.children.map((c) => {
    if (c.kind === 'leaf') {
      const field = fields.find((f) => f.key === c.field);
      const opLabel = OPERATORS.find((o) => o.key === c.operator)?.label || c.operator;
      const unit = field?.type === 'number' && field.unit ? ` ${field.unit}` : '';
      return `${field?.label || c.field} ${opLabel} « ${c.value || '…'}${unit} »`;
    }
    return `(${describeGroup(c, fields)})`;
  });
  return parts.join(group.op === 'AND' ? '  ET  ' : '  OU  ');
}

// ---------------------------------------------------------------------
// Petits composants d'UI
// ---------------------------------------------------------------------
const Btn = ({
  children,
  onClick,
  primary = false,
  small = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  small?: boolean;
}) => (
  <button className={`action${primary ? ' primary' : ''}${small ? ' small' : ''}`} onClick={onClick}>
    {children}
  </button>
);

function replaceChild(group: ConditionGroup, id: string, next: ConditionNode | null): ConditionGroup {
  return {
    ...group,
    children: group.children
      .map((c) => {
        if (c.id === id) return next;
        if (c.kind === 'group') return replaceChild(c, id, next);
        return c;
      })
      .filter((c): c is ConditionNode => c !== null),
  };
}

function LeafRow({
  leaf,
  fields,
  onChange,
  onRemove,
}: {
  leaf: ConditionLeaf;
  fields: FieldDef[];
  onChange: (next: ConditionLeaf) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.key === leaf.field) || fields[0];
  const ops = OPERATORS.filter((o) => o.types.includes(field.type));
  function setField(key: string) {
    const f = fields.find((x) => x.key === key) || fields[0];
    const validOps = OPERATORS.filter((o) => o.types.includes(f.type));
    onChange({ ...leaf, field: key, operator: validOps[0]?.key || leaf.operator, value: '' });
  }
  return (
    <div className="cond-leaf">
      <select value={leaf.field} onChange={(e) => setField(e.target.value)}>
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </select>
      <select value={leaf.operator} onChange={(e) => onChange({ ...leaf, operator: e.target.value })}>
        {ops.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {field.type === 'select' ? (
        <select value={leaf.value} onChange={(e) => onChange({ ...leaf, value: e.target.value })}>
          <option value="">—</option>
          {(field.options || []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={leaf.value}
          onChange={(e) => onChange({ ...leaf, value: e.target.value })}
          placeholder={field.unit ? `en ${field.unit}` : 'valeur'}
        />
      )}
      <button className="cond-remove" onClick={onRemove} aria-label="Supprimer la condition">
        <I.Trash2 />
      </button>
    </div>
  );
}

function ConditionGroupEditor({
  group,
  fields,
  depth,
  onChange,
  onRemove,
}: {
  group: ConditionGroup;
  fields: FieldDef[];
  depth: number;
  onChange: (next: ConditionGroup) => void;
  onRemove?: () => void;
}) {
  function updateChild(id: string, next: ConditionNode) {
    onChange(replaceChild(group, id, next));
  }
  function removeChild(id: string) {
    onChange(replaceChild(group, id, null));
  }
  function addLeaf() {
    const f = fields[0];
    onChange({
      ...group,
      children: [...group.children, { id: newId(), kind: 'leaf', field: f.key, operator: OPERATORS.find((o) => o.types.includes(f.type))!.key, value: '' }],
    });
  }
  function addGroup() {
    onChange({ ...group, children: [...group.children, emptyGroup()] });
  }
  return (
    <div className={`cond-group depth-${Math.min(depth, 3)}`}>
      <div className="cond-group-head">
        <div className="seg">
          <button className={group.op === 'AND' ? 'active' : ''} onClick={() => onChange({ ...group, op: 'AND' })}>
            ET
          </button>
          <button className={group.op === 'OR' ? 'active' : ''} onClick={() => onChange({ ...group, op: 'OR' })}>
            OU
          </button>
        </div>
        <button className="cond-add" onClick={addLeaf}>
          <I.Plus /> Condition
        </button>
        <button className="cond-add" onClick={addGroup}>
          <I.Layers /> Groupe imbriqué
        </button>
        {depth > 0 && onRemove && (
          <button className="cond-remove" onClick={onRemove} aria-label="Supprimer le groupe">
            <I.Trash2 />
          </button>
        )}
      </div>
      <div className="cond-children">
        {group.children.map((child) =>
          child.kind === 'leaf' ? (
            <LeafRow key={child.id} leaf={child} fields={fields} onChange={(n) => updateChild(child.id, n)} onRemove={() => removeChild(child.id)} />
          ) : (
            <ConditionGroupEditor
              key={child.id}
              group={child}
              fields={fields}
              depth={depth + 1}
              onChange={(n) => updateChild(child.id, n)}
              onRemove={() => removeChild(child.id)}
            />
          ),
        )}
        {!group.children.length && <p className="cond-empty">Groupe vide — ajoutez une condition ou un sous-groupe.</p>}
      </div>
    </div>
  );
}

function ActionRow({
  action,
  onChange,
  onRemove,
}: {
  action: AutomationActionInstance;
  onChange: (next: AutomationActionInstance) => void;
  onRemove: () => void;
}) {
  const def = ACTIONS_CATALOG.find((a) => a.kind === action.kind) || ACTIONS_CATALOG[0];
  return (
    <div className="action-row">
      <select value={action.kind} onChange={(e) => onChange({ ...action, kind: e.target.value, params: {} })}>
        {ACTIONS_CATALOG.map((a) => (
          <option key={a.kind} value={a.kind}>
            {a.label}
          </option>
        ))}
      </select>
      {def.params.map((p) =>
        p.type === 'select' ? (
          <select key={p.key} value={action.params[p.key] || ''} onChange={(e) => onChange({ ...action, params: { ...action.params, [p.key]: e.target.value } })}>
            <option value="">{p.label}</option>
            {(p.options || []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={p.key}
            value={action.params[p.key] || ''}
            onChange={(e) => onChange({ ...action, params: { ...action.params, [p.key]: e.target.value } })}
            placeholder={p.label}
          />
        ),
      )}
      <button className="cond-remove" onClick={onRemove} aria-label="Supprimer l’action">
        <I.Trash2 />
      </button>
    </div>
  );
}

function TraceLine({ trace }: { trace: LeafTrace | GroupTrace }) {
  if (trace.kind === 'group') {
    return (
      <div className="trace-group">
        <b className={trace.pass ? 'pass' : 'fail'}>
          {trace.pass ? <I.CheckCircle2 /> : <I.XCircle />} Groupe {trace.op}
        </b>
        <div className="trace-children">
          {trace.children.map((c) => (
            <TraceLine key={c.id} trace={c} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <p className={trace.pass ? 'pass' : 'fail'}>
      {trace.pass ? <I.CheckCircle2 /> : <I.XCircle />} {trace.label}
      <small> — valeur observée : « {trace.actual || '∅'} »</small>
    </p>
  );
}

// ---------------------------------------------------------------------
// Constructeur principal
// ---------------------------------------------------------------------
export function AutomationBuilder({
  flow,
  onSave,
  onClose,
  toast,
}: {
  flow: AutomationFlow | null;
  onSave: (f: AutomationFlow) => void;
  onClose: () => void;
  toast: (x: string) => void;
}) {
  const isEdit = !!flow;
  const [name, setName] = useState(flow?.name || '');
  const [triggerKind, setTriggerKind] = useState(flow?.triggerKind || TRIGGERS[0].kind);
  const [conditions, setConditions] = useState<ConditionGroup>(flow?.conditions || emptyGroup());
  const [delayEnabled, setDelayEnabled] = useState(!!flow?.delay);
  const [delay, setDelay] = useState<{ amount: number; unit: 'minutes' | 'heures' | 'jours' }>(
    flow?.delay || { amount: 1, unit: 'jours' },
  );
  const [actions, setActions] = useState<AutomationActionInstance[]>(flow?.actions || []);
  const sampleValuesFor = (kind: string): Record<string, string> => {
    const t = triggerOf(kind);
    const sample: Record<string, string> = {};
    for (const f of t.fields) sample[f.key] = String(t.sample[f.key] ?? '');
    return sample;
  };
  const [testValues, setTestValues] = useState<Record<string, string>>(() => sampleValuesFor(triggerKind));
  const [testResult, setTestResult] = useState<null | { group: GroupTrace; wouldRun: boolean }>(null);

  const trigger = triggerOf(triggerKind);

  // Changer de déclencheur réinitialise les valeurs de test sur ses valeurs
  // d'exemple : géré directement par le sélecteur plutôt que par un effet,
  // pour ne pas déclencher de rendu en cascade.
  function selectTrigger(kind: string) {
    setTriggerKind(kind);
    setTestValues(sampleValuesFor(kind));
    setTestResult(null);
  }

  function addAction() {
    setActions((v) => [...v, { id: newId(), kind: ACTIONS_CATALOG[0].kind, params: {} }]);
  }
  function updateAction(id: string, next: AutomationActionInstance) {
    setActions((v) => v.map((a) => (a.id === id ? next : a)));
  }
  function removeAction(id: string) {
    setActions((v) => v.filter((a) => a.id !== id));
  }
  function runTest() {
    const record: Record<string, string | number> = {};
    for (const f of trigger.fields) record[f.key] = f.type === 'number' ? Number(testValues[f.key] || 0) : testValues[f.key] || '';
    const group = evaluateGroup(conditions, trigger.fields, record);
    setTestResult({ group, wouldRun: group.pass });
    toast(group.pass ? 'Test : les conditions seraient remplies' : 'Test : les conditions ne seraient pas remplies');
  }

  const canActivate = name.trim().length > 0 && actions.length > 0;

  function buildFlow(status: 'draft' | 'active' | 'paused'): AutomationFlow {
    return {
      id: flow?.id || newId(),
      name: name.trim() || 'Nouveau workflow',
      triggerKind,
      conditions,
      delay: delayEnabled ? delay : undefined,
      actions,
      status,
      createdAt: flow?.createdAt || new Date().toISOString(),
      executions: flow?.executions || 0,
      lastRun: flow?.lastRun,
    };
  }

  return (
    <div className="modal builder-backdrop" onClick={onClose}>
      <div className="builder-panel" onClick={(e) => e.stopPropagation()}>
        <header className="builder-head">
          <div>
            <h3>{isEdit ? 'Modifier le workflow' : 'Créer un workflow'}</h3>
            <p>Déclencheur, conditions imbriquées, délai et actions — testez avant d’activer.</p>
          </div>
          <button onClick={onClose} aria-label="Fermer">
            <I.X />
          </button>
        </header>
        <div className="builder-body">
          <div className="builder-form">
            <label className="b-field">
              <b>Nom du workflow</b>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Relance après 7 jours sans réponse" />
            </label>

            <section className="b-step">
              <h4>
                <I.Workflow /> 1. Déclencheur
              </h4>
              <div className="trigger-grid">
                {TRIGGERS.map((t) => (
                  <button key={t.kind} className={t.kind === triggerKind ? 'selected' : ''} onClick={() => selectTrigger(t.kind)}>
                    <b>{t.label}</b>
                    <small>{t.description}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="b-step">
              <h4>
                <I.Filter /> 2. Conditions
              </h4>
              <p className="b-hint">Combinez des conditions avec ET / OU, et imbriquez des groupes pour des règles complexes.</p>
              <ConditionGroupEditor group={conditions} fields={trigger.fields} depth={0} onChange={setConditions} />
            </section>

            <section className="b-step">
              <h4>
                <I.Clock /> 3. Délai
              </h4>
              <label className="b-toggle">
                <input type="checkbox" checked={delayEnabled} onChange={(e) => setDelayEnabled(e.target.checked)} />
                Attendre avant d’exécuter les actions
              </label>
              {delayEnabled && (
                <div className="delay-row">
                  <input
                    type="number"
                    min={1}
                    value={delay.amount}
                    onChange={(e) => setDelay((d) => ({ ...d, amount: Math.max(1, Number(e.target.value) || 1) }))}
                  />
                  <select value={delay.unit} onChange={(e) => setDelay((d) => ({ ...d, unit: e.target.value as typeof d.unit }))}>
                    <option value="minutes">minutes</option>
                    <option value="heures">heures</option>
                    <option value="jours">jours</option>
                  </select>
                </div>
              )}
            </section>

            <section className="b-step">
              <h4>
                <I.Zap /> 4. Actions
              </h4>
              {actions.map((a) => (
                <ActionRow key={a.id} action={a} onChange={(n) => updateAction(a.id, n)} onRemove={() => removeAction(a.id)} />
              ))}
              <Btn small onClick={addAction}>
                <I.Plus /> Ajouter une action
              </Btn>
              {!actions.length && <p className="cond-empty">Ajoutez au moins une action pour pouvoir activer ce workflow.</p>}
            </section>

            <section className="b-step">
              <h4>
                <I.PlayCircle /> 5. Mode test
              </h4>
              <p className="b-hint">Renseignez des valeurs d’exemple pour le déclencheur puis lancez le test : aucune action réelle n’est exécutée.</p>
              <div className="test-fields">
                {trigger.fields.map((f) => (
                  <label key={f.key}>
                    {f.label}
                    {f.type === 'select' ? (
                      <select value={testValues[f.key] || ''} onChange={(e) => setTestValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                        {(f.options || []).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={f.type === 'number' ? 'number' : 'text'}
                        value={testValues[f.key] || ''}
                        onChange={(e) => setTestValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      />
                    )}
                  </label>
                ))}
              </div>
              <Btn onClick={runTest}>
                <I.PlayCircle /> Tester le workflow
              </Btn>
              {testResult && (
                <div className="test-trace">
                  <p className="trace-headline">
                    {testResult.wouldRun ? (
                      <>
                        <I.CheckCircle2 /> Les conditions seraient remplies.
                      </>
                    ) : (
                      <>
                        <I.XCircle /> Les conditions ne seraient pas remplies : le workflow s’arrêterait ici.
                      </>
                    )}
                  </p>
                  <TraceLine trace={testResult.group} />
                  {testResult.wouldRun && (
                    <>
                      {delayEnabled && (
                        <p className="trace-step">
                          <I.Clock /> Attendrait {delay.amount} {delay.unit} avant de continuer.
                        </p>
                      )}
                      <p className="trace-step">
                        <I.Zap /> Actions qui seraient exécutées :
                      </p>
                      <ul>
                        {actions.map((a) => {
                          const def = ACTIONS_CATALOG.find((x) => x.kind === a.kind)!;
                          const params = Object.values(a.params).filter(Boolean).join(', ');
                          return (
                            <li key={a.id}>
                              {def.label}
                              {params ? ` — ${params}` : ''}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>

          <aside className="builder-preview">
            <h4>
              <I.Eye /> Aperçu avant activation
            </h4>
            <p>
              <b>Déclencheur</b>
              <br />
              {trigger.label}
            </p>
            <p>
              <b>Conditions</b>
              <br />
              {describeGroup(conditions, trigger.fields)}
            </p>
            {delayEnabled && (
              <p>
                <b>Délai</b>
                <br />
                Attendre {delay.amount} {delay.unit}
              </p>
            )}
            <p>
              <b>Actions ({actions.length})</b>
            </p>
            <ul>
              {actions.map((a) => {
                const def = ACTIONS_CATALOG.find((x) => x.kind === a.kind)!;
                const params = Object.values(a.params).filter(Boolean).join(', ');
                return (
                  <li key={a.id}>
                    {def.label}
                    {params ? ` — ${params}` : ''}
                  </li>
                );
              })}
              {!actions.length && <li className="cond-empty">Aucune action définie</li>}
            </ul>
            {!canActivate && (
              <p className="b-warning">
                <I.AlertTriangle /> Donnez un nom et au moins une action pour pouvoir activer.
              </p>
            )}
            <div className="builder-actions">
              <Btn
                onClick={() => {
                  onSave(buildFlow('draft'));
                  toast('Workflow enregistré comme brouillon');
                }}
              >
                Enregistrer le brouillon
              </Btn>
              <Btn
                primary
                onClick={() => {
                  if (!canActivate) {
                    toast('Complétez le nom et au moins une action avant d’activer');
                    return;
                  }
                  onSave(buildFlow('active'));
                  toast('Workflow activé');
                }}
              >
                <I.CheckCircle2 /> Activer
              </Btn>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
