import { Injectable } from '@angular/core';

export enum StorageType {
  Session,
  Permanent,
  Ephemeral,
}

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private values: Record<string, unknown> = {};

  public store(key: string, value: unknown): void;
  public store(key: string, value: unknown, storageType: StorageType): void;
  public store(
    key: string,
    value: unknown,
    storageType: StorageType = StorageType.Permanent,
  ): void {
    if (typeof window === 'undefined') {
      storageType = StorageType.Ephemeral;
    }

    switch (storageType) {
      case StorageType.Ephemeral:
        this.storeEphemeral(key, value);
        break;
      case StorageType.Session:
        this.storeSession(key, value);
        break;
      case StorageType.Permanent:
        this.storePermanent(key, value);
        break;
    }
  }

  public get(key: string): unknown;
  public get<T>(
    key: string,
    defaultValue: T extends StorageType ? never : T,
  ): T;
  public get(key: string, storageType: StorageType): unknown;
  public get<T>(key: string, defaultValue: T, storageType: StorageType): T;
  public get<T>(
    key: string,
    defaultValueOrStorageType?: T | StorageType,
    storageType?: StorageType,
  ): unknown {
    const hasDefault: boolean =
      typeof defaultValueOrStorageType !== 'undefined' &&
      (typeof defaultValueOrStorageType !== 'number' ||
        !Object.values(StorageType).includes(defaultValueOrStorageType));

    if (typeof window === 'undefined') {
      storageType = StorageType.Ephemeral;
    }
    if (storageType === undefined) {
      if (
        typeof defaultValueOrStorageType === 'number' &&
        Object.values(StorageType).includes(defaultValueOrStorageType)
      ) {
        storageType = defaultValueOrStorageType;
      } else {
        storageType = StorageType.Permanent;
      }
    }

    const defaultValue: T | null = hasDefault
      ? defaultValueOrStorageType as T
      : null;

    let value: T | null;
    switch (storageType) {
      case StorageType.Ephemeral:
        value = this.getEphemeral(key) ?? defaultValue;
        break;
      case StorageType.Session:
        value = this.getSession(key) ?? defaultValue;
        break;
      case StorageType.Permanent:
        value = this.getPermanent(key) ?? defaultValue;
        break;
    }

    return value;
  }

  private storeEphemeral(key: string, value: unknown): void {
    this.values[key] = value;
  }

  private storeSession(key: string, value: unknown): void {
    sessionStorage.setItem(key, JSON.stringify(value));
  }

  private storePermanent(key: string, value: unknown): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  private getEphemeral<T>(key: string): T | null {
    return (this.values[key] as T) ?? null;
  }

  private getSession<T>(key: string): T | null {
    const value = sessionStorage.getItem(key);
    if (value === null) {
      return null;
    }

    return JSON.parse(value);
  }

  private getPermanent<T>(key: string): T | null {
    const value = localStorage.getItem(key);
    if (value === null) {
      return null;
    }

    return JSON.parse(value);
  }
}
