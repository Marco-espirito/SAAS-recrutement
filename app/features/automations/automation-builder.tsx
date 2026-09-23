'use client';

import { useState } from 'react';
import type {
  AutomationCondition,
  AutomationPredicate,
} from '@/lib/domain/automation';

type Group = { operator: 'all' | 'any'; conditions: AutomationPredicate[] };
type Action = {
  type: 'CREATE_TASK' | 'CREATE_EMAIL_DRAFT' | 'UPDATE_APPLICATION_STAGE';
  title: string;
  body: string;
  stage: string;
  dueInDays: number;
};
type Preview = {
  matches: boolean;
  scheduledAt: string | null;
  actions: unknown[];
  executed: false;
};
const stages = [
  'TO_APPLY',
  'SENT',
  'FOLLOW_UP',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'PLACED',
];
const freshCondition = (): AutomationPredicate => ({
  field: 'stage',
  operator: 'equals',
  value: 'SENT',
});
const freshAction = (): Action => ({
  type: 'CREATE_TASK',
  title: 'Vérifier la candidature',
  body: '',
  stage: 'FOLLOW_UP',
  dueInDays: 0,
});

export function AutomationBuilder({
  onCreated,
  toast,
}: {
  onCreated: () => void;
  toast: (message: string) => void;
}) {
  const [name, setName] = useState('Relance après 7 jours');
  const [triggerType, setTriggerType] = useState<
    'APPLICATION_CREATED' | 'APPLICATION_STAGE_CHANGED'
  >('APPLICATION_STAGE_CHANGED');
  const [delayDays, setDelayDays] = useState(7);
  const [rootOperator, setRootOperator] = useState<'all' | 'any'>('all');
  const [groups, setGroups] = useState<Group[]>([
    { operator: 'all', conditions: [freshCondition()] },
  ]);
  const [actions, setActions] = useState<Action[]>([freshAction()]);
  const [sampleStage, setSampleStage] = useState('SENT');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [activate, setActivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function invalidate() {
    setPreview(null);
    setError('');
  }
  function updateGroup(index: number, next: Group) {
    setGroups((current) =>
      current.map((item, at) => (at === index ? next : item)),
    );
    invalidate();
  }
  function updateAction(index: number, next: Action) {
    setActions((current) =>
      current.map((item, at) => (at === index ? next : item)),
    );
    invalidate();
  }
  function definition() {
    const conditions: AutomationCondition[] = groups.length
      ? [
          {
            operator: rootOperator,
            conditions: groups.map((group) => ({
              operator: group.operator,
              conditions: group.conditions,
            })),
          },
        ]
      : [];
    return {
      name: name.trim(),
      triggerType,
      delayDays,
      conditions,
      actions: actions.map((action) =>
        action.type === 'CREATE_TASK'
          ? {
              type: action.type,
              title: action.title,
              body: action.body,
              dueInDays: action.dueInDays,
            }
          : action.type === 'CREATE_EMAIL_DRAFT'
            ? { type: action.type, title: action.title, body: action.body }
            : { type: action.type, stage: action.stage },
      ),
    };
  }
  async function test() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/automations/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...definition(),
          payload: { stage: sampleStage },
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? 'Test impossible');
      setPreview(result as Preview);
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'Test impossible');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/automations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...definition(),
          enabled: activate && preview.matches,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? 'Enregistrement impossible');
      toast(
        activate && preview.matches
          ? 'Automatisation activée'
          : 'Automatisation enregistrée en pause',
      );
      setPreview(null);
      setActivate(false);
      onCreated();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Enregistrement impossible',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="panel automation-builder"
      aria-label="Constructeur d’automatisation"
    >
      <h2>Construire une automatisation</h2>
      <p>
        Définissez le déclencheur, les conditions et les actions. Un test ne
        modifie aucune donnée.
      </p>
      <div className="builder-grid">
        <label>
          Nom
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              invalidate();
            }}
          />
        </label>
        <label>
          Quand
          <select
            value={triggerType}
            onChange={(event) => {
              setTriggerType(event.target.value as typeof triggerType);
              invalidate();
            }}
          >
            <option value="APPLICATION_CREATED">Candidature créée</option>
            <option value="APPLICATION_STAGE_CHANGED">
              Statut de candidature modifié
            </option>
          </select>
        </label>
        <label>
          Attendre (jours)
          <input
            type="number"
            min="0"
            max="365"
            value={delayDays}
            onChange={(event) => {
              setDelayDays(Number(event.target.value));
              invalidate();
            }}
          />
        </label>
      </div>
      <div className="builder-section">
        <h3>Si</h3>
        <label>
          Entre les groupes
          <select
            value={rootOperator}
            onChange={(event) => {
              setRootOperator(event.target.value as 'all' | 'any');
              invalidate();
            }}
          >
            <option value="all">Toutes les conditions</option>
            <option value="any">Au moins un groupe</option>
          </select>
        </label>
        {groups.map((group, groupIndex) => (
          <div className="builder-group" key={groupIndex}>
            <label>
              Dans ce groupe
              <select
                value={group.operator}
                onChange={(event) =>
                  updateGroup(groupIndex, {
                    ...group,
                    operator: event.target.value as 'all' | 'any',
                  })
                }
              >
                <option value="all">Tout doit correspondre (ET)</option>
                <option value="any">Une condition suffit (OU)</option>
              </select>
            </label>
            {group.conditions.map((condition, conditionIndex) => (
              <div className="builder-rule" key={conditionIndex}>
                <select
                  aria-label="Champ"
                  value={condition.field}
                  onChange={(event) =>
                    updateGroup(groupIndex, {
                      ...group,
                      conditions: group.conditions.map((item, at) =>
                        at === conditionIndex
                          ? { ...item, field: event.target.value }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="stage">Statut</option>
                </select>
                <select
                  aria-label="Comparaison"
                  value={condition.operator}
                  onChange={(event) =>
                    updateGroup(groupIndex, {
                      ...group,
                      conditions: group.conditions.map((item, at) =>
                        at === conditionIndex
                          ? {
                              ...item,
                              operator: event.target
                                .value as AutomationPredicate['operator'],
                            }
                          : item,
                      ),
                    })
                  }
                >
                  <option value="equals">est</option>
                  <option value="not_equals">n’est pas</option>
                  <option value="contains">contient</option>
                </select>
                <select
                  aria-label="Valeur"
                  value={String(condition.value)}
                  onChange={(event) =>
                    updateGroup(groupIndex, {
                      ...group,
                      conditions: group.conditions.map((item, at) =>
                        at === conditionIndex
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    })
                  }
                >
                  {stages.map((stage) => (
                    <option key={stage}>{stage}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (group.conditions.length > 1)
                      updateGroup(groupIndex, {
                        ...group,
                        conditions: group.conditions.filter(
                          (_, at) => at !== conditionIndex,
                        ),
                      });
                  }}
                  disabled={group.conditions.length === 1}
                >
                  Retirer
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                updateGroup(groupIndex, {
                  ...group,
                  conditions: [...group.conditions, freshCondition()],
                })
              }
            >
              + Condition
            </button>
            <button
              type="button"
              disabled={groups.length === 1}
              onClick={() => {
                setGroups((current) =>
                  current.filter((_, at) => at !== groupIndex),
                );
                invalidate();
              }}
            >
              Retirer le groupe
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setGroups((current) => [
              ...current,
              { operator: 'all', conditions: [freshCondition()] },
            ]);
            invalidate();
          }}
        >
          + Groupe ET/OU
        </button>
      </div>
      <div className="builder-section">
        <h3>Alors</h3>
        {actions.map((action, index) => (
          <div className="builder-action" key={index}>
            <select
              aria-label="Action"
              value={action.type}
              onChange={(event) =>
                updateAction(index, {
                  ...action,
                  type: event.target.value as Action['type'],
                })
              }
            >
              <option value="CREATE_TASK">Créer une tâche</option>
              <option value="CREATE_EMAIL_DRAFT">
                Préparer un brouillon d’e-mail
              </option>
              <option value="UPDATE_APPLICATION_STAGE">
                Modifier le statut
              </option>
            </select>
            {action.type === 'UPDATE_APPLICATION_STAGE' ? (
              <select
                aria-label="Nouveau statut"
                value={action.stage}
                onChange={(event) =>
                  updateAction(index, { ...action, stage: event.target.value })
                }
              >
                {stages.map((stage) => (
                  <option key={stage}>{stage}</option>
                ))}
              </select>
            ) : (
              <>
                <input
                  aria-label="Titre"
                  placeholder="Titre"
                  value={action.title}
                  onChange={(event) =>
                    updateAction(index, {
                      ...action,
                      title: event.target.value,
                    })
                  }
                />
                <input
                  aria-label="Contenu"
                  placeholder="Contenu"
                  value={action.body}
                  onChange={(event) =>
                    updateAction(index, { ...action, body: event.target.value })
                  }
                />
              </>
            )}
            {action.type === 'CREATE_TASK' && (
              <label>
                Échéance (jours)
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={action.dueInDays}
                  onChange={(event) =>
                    updateAction(index, {
                      ...action,
                      dueInDays: Number(event.target.value),
                    })
                  }
                />
              </label>
            )}
            <button
              type="button"
              disabled={actions.length === 1}
              onClick={() => {
                setActions((current) =>
                  current.filter((_, at) => at !== index),
                );
                invalidate();
              }}
            >
              Retirer
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setActions((current) => [...current, freshAction()]);
            invalidate();
          }}
        >
          + Action
        </button>
      </div>
      <div className="builder-section">
        <h3>Tester avant activation</h3>
        <label>
          Statut de l’événement simulé
          <select
            value={sampleStage}
            onChange={(event) => {
              setSampleStage(event.target.value);
              invalidate();
            }}
          >
            {stages.map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="action"
          disabled={busy}
          onClick={() => void test()}
        >
          Tester sans exécuter
        </button>
        {preview && (
          <output className="builder-preview">
            <b>
              {preview.matches
                ? 'Conditions satisfaites'
                : 'Conditions non satisfaites'}
            </b>
            <span>
              {preview.matches
                ? `${preview.actions.length} action(s) prévues le ${new Date(preview.scheduledAt!).toLocaleString('fr-FR')}`
                : 'Aucune action ne serait lancée.'}
            </span>
            <small>Aucune donnée modifiée par ce test.</small>
          </output>
        )}
        {error && (
          <p role="alert" className="auth-alert">
            {error}
          </p>
        )}
        <label>
          <input
            type="checkbox"
            checked={activate}
            onChange={(event) => setActivate(event.target.checked)}
          />{' '}
          Activer après enregistrement
        </label>
        <button
          type="button"
          className="action primary"
          disabled={!preview || busy || (activate && !preview.matches)}
          onClick={() => void save()}
        >
          Enregistrer {activate ? 'et activer' : 'en pause'}
        </button>
      </div>
    </section>
  );
}
