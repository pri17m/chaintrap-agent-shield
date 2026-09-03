const SECRET_KEY = "chaintrap.apiKey";

/** Thin SecretStorage wrapper — injectable for unit tests. */
export interface SecretMap {
  get(key: string): Thenable<string | undefined>;
  store(key: string, value: string): Thenable<void>;
  delete(key: string): Thenable<void>;
}

export class ApiKeyStore {
  constructor(private readonly secrets: SecretMap) {}

  async get(): Promise<string> {
    const v = await this.secrets.get(SECRET_KEY);
    return (v || "").trim();
  }

  async set(value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed) {
      await this.clear();
      return;
    }
    await this.secrets.store(SECRET_KEY, trimmed);
  }

  async clear(): Promise<void> {
    await this.secrets.delete(SECRET_KEY);
  }

  /**
   * One-time migrate from deprecated plaintext setting into SecretStorage.
   * Returns true if a migration write occurred.
   */
  async migrateFromPlaintext(plain: string | undefined, clearPlain: () => Thenable<void>): Promise<boolean> {
    const existing = await this.get();
    const fromSettings = (plain || "").trim();
    if (!fromSettings) {
      return false;
    }
    if (!existing) {
      await this.set(fromSettings);
    }
    await clearPlain();
    return true;
  }
}

export { SECRET_KEY as API_KEY_SECRET_ID };
