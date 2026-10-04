/**
 * Settings the user changes from the app: API keys for cloud providers and the chat model.
 *
 * They live in `settings.json` in the Torvaix data folder, readable only by the user who runs
 * Torvaix. Keys are never sent back to the browser: the app only learns whether a provider has
 * one, where it came from, and its last four characters.
 */

import fs from 'fs';
import path from 'path';
import { isProviderId, type ProviderId } from '@torvaix/providers';

export interface ChatModelChoice {
  provider: ProviderId;
  id: string;
}

interface SettingsFile {
  apiKeys: Partial<Record<ProviderId, string>>;
  model?: ChatModelChoice;
}

export const API_KEY_ENV: Record<Exclude<ProviderId, 'ollama'>, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

const MAX_KEY_CHARS = 500;
const MAX_MODEL_CHARS = 200;

/** Returns an error message, or null when `value` looks like an API key. */
export function validateApiKey(value: unknown): string | null {
  if (typeof value !== 'string') return 'apiKey must be text';
  const key = value.trim();
  if (key.length < 8) return 'That API key is too short';
  if (key.length > MAX_KEY_CHARS) return 'That API key is too long';
  if (/[\s\u0000-\u001f\u007f]/.test(key)) return 'An API key cannot contain spaces or line breaks';
  return null;
}

/** Returns an error message, or null when `value` is a usable model id. */
export function validateModelId(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return 'model is required';
  if (value.length > MAX_MODEL_CHARS) return 'model is too long';
  if (/[\s\u0000-\u001f\u007f]/.test(value.trim())) return 'A model id cannot contain spaces';
  return null;
}

/** Enough of a key to recognise it by, never enough to use it. */
export function keyHint(key: string): string {
  return key.length >= 12 ? `…${key.slice(-4)}` : '…';
}

export class SettingsStore {
  private data: SettingsFile = { apiKeys: {} };

  constructor(private readonly file: string) {
    this.load();
  }

  private load(): void {
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return; // no file yet, or unreadable: start with empty settings
    }
    if (!raw || typeof raw !== 'object') return;
    const { apiKeys, model } = raw as { apiKeys?: unknown; model?: unknown };

    if (apiKeys && typeof apiKeys === 'object') {
      for (const [provider, key] of Object.entries(apiKeys)) {
        if (isProviderId(provider) && provider !== 'ollama' && validateApiKey(key) === null) {
          this.data.apiKeys[provider] = (key as string).trim();
        }
      }
    }
    const choice = model as Partial<ChatModelChoice> | undefined;
    if (choice && isProviderId(choice.provider) && validateModelId(choice.id) === null) {
      this.data.model = { provider: choice.provider, id: (choice.id as string).trim() };
    }
  }

  /** Writes to a temporary file first, so a crash mid-write can't leave half a settings file. */
  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    fs.chmodSync(this.file, 0o600);
  }

  getApiKey(provider: ProviderId): string | undefined {
    return this.data.apiKeys[provider];
  }

  setApiKey(provider: ProviderId, key: string): void {
    this.data.apiKeys[provider] = key.trim();
    this.save();
  }

  removeApiKey(provider: ProviderId): void {
    delete this.data.apiKeys[provider];
    this.save();
  }

  getModel(): ChatModelChoice | undefined {
    return this.data.model;
  }

  setModel(choice: ChatModelChoice | undefined): void {
    if (choice) this.data.model = { provider: choice.provider, id: choice.id.trim() };
    else delete this.data.model;
    this.save();
  }
}
