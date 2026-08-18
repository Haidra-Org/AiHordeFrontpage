import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { API_BASE_URL } from './api-config';
import { DatabaseService } from './database.service';
import { CLIENT_AGENT } from './interceptors/client-agent.interceptor';
import {
  SamplerConstraintsDocument,
  coerceSamplerConstraints,
} from '../types/sampler-constraints';

const CACHE_PREFIX = 'aihorde.generate.sampler_constraints';

interface SamplerContractCache {
  current: string;
  versions: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class SamplerConstraintsService {
  private readonly http = inject(HttpClient);
  private readonly db = inject(DatabaseService);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly context = new HttpContext().set(
    CLIENT_AGENT,
    'AiHordeFrontpage:generate',
  );

  public readonly contract = signal<SamplerConstraintsDocument | null>(null);
  public readonly loading = signal(false);
  private started = false;

  /** Self-hosted APIs may publish a different contract under the same UI. */
  private readonly cacheKey = `${CACHE_PREFIX}.${encodeURIComponent(this.baseUrl)}`;

  /** Publish a compatible cache immediately, then replace it from the API. */
  public load(): void {
    if (this.started) return;
    this.started = true;

    const cache = this.db.get(this.cacheKey) as SamplerContractCache | null;
    const cached = coerceSamplerConstraints(
      cache?.versions?.[cache.current] ?? null,
    );
    if (cached) this.contract.set(cached);

    this.loading.set(true);
    this.http
      .get<unknown>(`${this.baseUrl}/status/sampler_constraints`, {
        context: this.context,
      })
      .pipe(catchError(() => of(null)))
      .subscribe((raw) => {
        this.loading.set(false);
        const contract = coerceSamplerConstraints(raw);
        if (!contract) return;
        this.contract.set(contract);
        const prior = this.db.get(this.cacheKey) as SamplerContractCache | null;
        this.db.store(this.cacheKey, {
          current: contract.schema_version,
          versions: {
            ...(prior?.versions ?? {}),
            [contract.schema_version]: contract,
          },
        } satisfies SamplerContractCache);
      });
  }
}
