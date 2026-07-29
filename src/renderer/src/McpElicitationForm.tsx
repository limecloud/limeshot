import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

import type { AgentJsonValue, AgentMcpElicitationProjection } from '../../shared/desktop';
import type { TranslationKey } from './i18n';

type Translate = (key: TranslationKey) => string;
type FieldValue = string | number | boolean | string[];
type JsonObject = { [key: string]: AgentJsonValue };

interface McpElicitationFormProps {
  interaction: AgentMcpElicitationProjection;
  disabled: boolean;
  onSubmit: (action: 'accept' | 'decline' | 'cancel', content?: AgentJsonValue) => Promise<void>;
  onOpenExternal: () => Promise<void>;
  t: Translate;
}

export function McpElicitationForm({ interaction, disabled, onSubmit, onOpenExternal, t }: McpElicitationFormProps) {
  if (interaction.mode === 'url') {
    return <McpUrlPrompt interaction={interaction} disabled={disabled} onSubmit={onSubmit} onOpenExternal={onOpenExternal} t={t} />;
  }
  return <McpSchemaForm interaction={interaction} disabled={disabled} onSubmit={onSubmit} t={t} />;
}

function McpUrlPrompt({ interaction, disabled, onSubmit, onOpenExternal, t }: McpElicitationFormProps) {
  const [opened, setOpened] = useState(false);
  const [openError, setOpenError] = useState(false);
  const open = async () => {
    setOpenError(false);
    try {
      await onOpenExternal();
      setOpened(true);
    } catch {
      setOpenError(true);
    }
  };
  return (
    <div className="interaction-form">
      <p>{interaction.message}</p>
      {interaction.urlLabel ? <code className="interaction-url-label">{interaction.urlLabel}</code> : null}
      {openError ? <p className="interaction-error" role="alert">{t('interaction.openExternalFailed')}</p> : null}
      <div className="interaction-actions">
        <button type="button" className="primary" disabled={disabled} onClick={() => void open()}><ExternalLink size={13} aria-hidden="true" />{t('interaction.openExternal')}</button>
        {opened ? <button type="button" disabled={disabled} onClick={() => void onSubmit('accept')}>{t('interaction.externalCompleted')}</button> : null}
        <button type="button" className="danger" disabled={disabled} onClick={() => void onSubmit('decline')}>{t('interaction.decline')}</button>
        <button type="button" disabled={disabled} onClick={() => void onSubmit('cancel')}>{t('interaction.cancel')}</button>
      </div>
    </div>
  );
}

function McpSchemaForm({ interaction, disabled, onSubmit, t }: Omit<McpElicitationFormProps, 'onOpenExternal'>) {
  const schema = jsonObject(interaction.schema);
  const properties = jsonObject(schema?.properties);
  const fields = Object.entries(properties ?? {});
  const required = new Set(Array.isArray(schema?.required) ? schema.required.filter((value): value is string => typeof value === 'string') : []);
  const [values, setValues] = useState<Record<string, FieldValue>>(() => Object.fromEntries(fields.map(([name, value]) => [name, initialValue(jsonObject(value))])));
  const [validationError, setValidationError] = useState<string>();

  const submit = async () => {
    const error = validateFields(fields, required, values, t);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(undefined);
    const content: JsonObject = {};
    for (const [name, schemaValue] of fields) {
      const fieldSchema = jsonObject(schemaValue);
      const value = values[name];
      if (!required.has(name) && isEmptyValue(value)) continue;
      content[name] = toJsonValue(value, fieldSchema);
    }
    await onSubmit('accept', content);
  };

  return (
    <div className="interaction-form">
      <p>{interaction.message}</p>
      {fields.length > 0 ? <div className="mcp-form-fields">{fields.map(([name, schemaValue]) => (
        <McpField
          name={name}
          schema={jsonObject(schemaValue) ?? {}}
          value={values[name] ?? ''}
          required={required.has(name)}
          disabled={disabled}
          onChange={(value) => setValues((current) => ({ ...current, [name]: value }))}
          t={t}
          key={name}
        />
      ))}</div> : null}
      {validationError ? <p className="interaction-error" role="alert">{validationError}</p> : null}
      {interaction.schema !== undefined ? (
        <details className="interaction-schema"><summary>{t('interaction.schema')}</summary><pre>{JSON.stringify(interaction.schema, null, 2)}</pre></details>
      ) : null}
      <div className="interaction-actions">
        <button type="button" className="primary" disabled={disabled} onClick={() => void submit()}>{t('interaction.submit')}</button>
        <button type="button" className="danger" disabled={disabled} onClick={() => void onSubmit('decline')}>{t('interaction.decline')}</button>
        <button type="button" disabled={disabled} onClick={() => void onSubmit('cancel')}>{t('interaction.cancel')}</button>
      </div>
    </div>
  );
}

function McpField({ name, schema, value, required, disabled, onChange, t }: { name: string; schema: JsonObject; value: FieldValue; required: boolean; disabled: boolean; onChange: (value: FieldValue) => void; t: Translate }) {
  const title = typeof schema.title === 'string' && schema.title.trim() ? schema.title : name;
  const description = typeof schema.description === 'string' ? schema.description : undefined;
  const type = schema.type;
  const options = enumOptions(schema);
  const id = `mcp-field-${name}`;

  if (type === 'boolean') {
    return <label className="mcp-boolean-field" htmlFor={id}><input id={id} type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span><strong>{title}</strong>{description ? <small>{description}</small> : null}</span></label>;
  }
  if (type === 'array' && options.length > 0) {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset className="mcp-field"><legend>{title}{required ? <em>{t('interaction.required')}</em> : null}</legend>{description ? <p>{description}</p> : null}
        <div className="mcp-options">{options.map((option) => <label key={option.value}><input type="checkbox" checked={selected.includes(option.value)} disabled={disabled} onChange={() => onChange(selected.includes(option.value) ? selected.filter((entry) => entry !== option.value) : [...selected, option.value])} /><span>{option.label}</span></label>)}</div>
      </fieldset>
    );
  }
  if (options.length > 0) {
    return (
      <label className="mcp-field" htmlFor={id}><span><strong>{title}</strong>{required ? <em>{t('interaction.required')}</em> : null}</span>{description ? <small>{description}</small> : null}
        <select id={id} value={typeof value === 'string' ? value : ''} disabled={disabled} required={required} onChange={(event) => onChange(event.target.value)}>
          <option value="">{t('interaction.selectOption')}</option>{options.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
      </label>
    );
  }
  if (type === 'number' || type === 'integer') {
    return (
      <label className="mcp-field" htmlFor={id}><span><strong>{title}</strong>{required ? <em>{t('interaction.required')}</em> : null}</span>{description ? <small>{description}</small> : null}
        <input id={id} type="number" value={typeof value === 'number' ? value : ''} disabled={disabled} required={required} min={number(schema.minimum)} max={number(schema.maximum)} step={type === 'integer' ? 1 : 'any'} onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))} />
      </label>
    );
  }
  const format = typeof schema.format === 'string' ? schema.format : '';
  const inputType = format === 'email' ? 'email' : format === 'uri' ? 'url' : format === 'date' ? 'date' : format === 'date-time' ? 'datetime-local' : 'text';
  return (
    <label className="mcp-field" htmlFor={id}><span><strong>{title}</strong>{required ? <em>{t('interaction.required')}</em> : null}</span>{description ? <small>{description}</small> : null}
      <input id={id} type={inputType} value={typeof value === 'string' ? value : ''} disabled={disabled} required={required} minLength={number(schema.minLength)} maxLength={number(schema.maxLength)} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function initialValue(schema: JsonObject | undefined): FieldValue {
  const value = schema?.default;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  if (schema?.type === 'boolean') return false;
  if (schema?.type === 'array') return [];
  return '';
}

function enumOptions(schema: JsonObject): Array<{ value: string; label: string }> {
  const direct = Array.isArray(schema.enum) ? schema.enum.filter((value): value is string => typeof value === 'string') : [];
  const names = Array.isArray(schema.enumNames) ? schema.enumNames.filter((value): value is string => typeof value === 'string') : [];
  if (direct.length > 0) return direct.map((value, index) => ({ value, label: names[index] ?? value }));
  const variants = Array.isArray(schema.oneOf) ? schema.oneOf : [];
  const directVariants = variants.map(jsonObject).filter((value): value is JsonObject => Boolean(value));
  if (directVariants.length > 0) return directVariants.flatMap((entry) => typeof entry.const === 'string' ? [{ value: entry.const, label: typeof entry.title === 'string' ? entry.title : entry.const }] : []);
  const items = jsonObject(schema.items);
  if (!items) return [];
  const itemEnum = Array.isArray(items.enum) ? items.enum.filter((value): value is string => typeof value === 'string') : [];
  if (itemEnum.length > 0) return itemEnum.map((value) => ({ value, label: value }));
  const itemVariants = Array.isArray(items.anyOf) ? items.anyOf : Array.isArray(items.oneOf) ? items.oneOf : [];
  return itemVariants.map(jsonObject).filter((value): value is JsonObject => Boolean(value)).flatMap((entry) => typeof entry.const === 'string' ? [{ value: entry.const, label: typeof entry.title === 'string' ? entry.title : entry.const }] : []);
}

function validateFields(fields: Array<[string, AgentJsonValue]>, required: Set<string>, values: Record<string, FieldValue>, t: Translate): string | undefined {
  for (const [name, schemaValue] of fields) {
    const schema = jsonObject(schemaValue) ?? {};
    const value = values[name];
    if (required.has(name) && isEmptyValue(value)) return `${name}: ${t('interaction.fieldRequired')}`;
    if (typeof value === 'string') {
      const min = number(schema.minLength);
      const max = number(schema.maxLength);
      if (min !== undefined && value.length < min) return `${name}: ${t('interaction.valueTooShort')}`;
      if (max !== undefined && value.length > max) return `${name}: ${t('interaction.valueTooLong')}`;
    }
    if (typeof value === 'number') {
      const min = number(schema.minimum);
      const max = number(schema.maximum);
      if (min !== undefined && value < min) return `${name}: ${t('interaction.valueTooSmall')}`;
      if (max !== undefined && value > max) return `${name}: ${t('interaction.valueTooLarge')}`;
    }
  }
  return undefined;
}

function toJsonValue(value: FieldValue | undefined, schema: JsonObject | undefined): AgentJsonValue {
  if (schema?.type === 'integer' && typeof value === 'number') return Math.trunc(value);
  if (value === undefined) return '';
  return value;
}

function isEmptyValue(value: FieldValue | undefined): boolean {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

function jsonObject(value: AgentJsonValue | undefined): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

function number(value: AgentJsonValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
