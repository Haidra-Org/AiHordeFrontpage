import {
  DBSchema,
  IDBPDatabase,
  IDBPTransaction,
  StoreNames,
  deleteDB,
  openDB,
} from 'idb';

/** The transaction handed to an `upgrade` callback. */
export type StudioUpgradeTransaction<Schema extends DBSchema> = IDBPTransaction<
  Schema,
  StoreNames<Schema>[],
  'versionchange'
>;

export interface StudioDbOptions<Schema extends DBSchema> {
  name: string;
  version: number;
  /**
   * Provision stores and indexes. Must be additive: create-if-absent only, never
   * dropping a store or changing a keyPath, so a newer database opened by older
   * code still carries everything that code needs.
   */
  ensureSchema: (
    db: IDBPDatabase<Schema>,
    tx: StudioUpgradeTransaction<Schema>,
  ) => void;
  /** Whether an opened database carries the stores the caller cannot work without. */
  hasRequiredStores: (db: IDBPDatabase<Schema>) => boolean;
  /** Named in recovery warnings so a wipe is attributable to a subsystem. */
  historyLabel: string;
}

/** A `VersionError` fires when the on-disk version already exceeds the request. */
export function isVersionError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'VersionError';
}

function upgradeCallback<Schema extends DBSchema>(
  options: StudioDbOptions<Schema>,
) {
  return (
    database: IDBPDatabase<Schema>,
    _oldVersion: number,
    _newVersion: number | null,
    tx: StudioUpgradeTransaction<Schema>,
  ): void => options.ensureSchema(database, tx);
}

function recreate<Schema extends DBSchema>(
  options: StudioDbOptions<Schema>,
): Promise<IDBPDatabase<Schema>> {
  // Without a `blocked` handler an open connection in another tab leaves the
  // delete pending forever, and every caller awaiting the memoized open hangs
  // with it. Warn and let the delete resolve when the other tab goes away.
  return deleteDB(options.name, {
    blocked: () =>
      console.warn(
        `IndexedDB "${options.name}" cannot be recreated while another tab holds it open.`,
      ),
  }).then(() =>
    openDB<Schema>(options.name, options.version, {
      upgrade: upgradeCallback(options),
    }),
  );
}

/**
 * Open a studio database, tolerating a layout newer than this build expects.
 *
 * A database that has been through a later version of the app is adopted as-is
 * rather than destroyed: schema growth here is additive by contract, so the
 * stores this build needs are still present and still shaped the same way. Only
 * a database that genuinely lacks those stores is discarded, because every write
 * against it would otherwise throw.
 */
export async function openStudioDb<Schema extends DBSchema>(
  options: StudioDbOptions<Schema>,
): Promise<IDBPDatabase<Schema>> {
  try {
    const db = await openDB<Schema>(options.name, options.version, {
      upgrade: upgradeCallback(options),
    });
    if (options.hasRequiredStores(db)) {
      return db;
    }
    // The database already sat at or above our version with a foreign layout, so
    // the upgrade callback never ran and our stores are absent.
    console.warn(
      `IndexedDB "${options.name}" is missing required stores; recreating it and discarding stored ${options.historyLabel}.`,
    );
    db.close();
    return await recreate(options);
  } catch (error) {
    if (!isVersionError(error)) {
      throw error;
    }
    const adopted = await openDB<Schema>(options.name);
    if (options.hasRequiredStores(adopted)) {
      return adopted;
    }
    console.warn(
      `IndexedDB "${options.name}" is at a newer version without the required stores; recreating it and discarding stored ${options.historyLabel}.`,
      error,
    );
    adopted.close();
    return await recreate(options);
  }
}
