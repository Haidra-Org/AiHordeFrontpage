import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from './api-config';
import { DatabaseService } from './database.service';
import { SamplerConstraintsService } from './sampler-constraints.service';
import { API_BASE } from '../testing/api-test-helpers';

const contract = {
  schema_version: '1.0',
  samplers: {
    k_euler: {
      name: 'k_euler',
      presentation_tier: 'recommended',
      solver_type_choices: [],
      accepted_settings: {},
    },
  },
  hard_constraints: {
    rejected_sampler_scheduler_pairings: [],
    scheduler_baseline_applicability: {},
  },
  presentation_tiers: { recommended: ['k_euler'] },
};

describe('SamplerConstraintsService', () => {
  let http: HttpTestingController;
  let service: SamplerConstraintsService;
  let cache: Map<string, unknown>;
  let store: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cache = new Map();
    store = vi.fn((key: string, value: unknown) => cache.set(key, value));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: API_BASE },
        {
          provide: DatabaseService,
          useValue: {
            get: (key: string) => cache.get(key) ?? null,
            store,
          },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(SamplerConstraintsService);
  });

  afterEach(() => http.verify());

  it('publishes a compatible cache while refreshing it', () => {
    const key = `aihorde.generate.sampler_constraints.${encodeURIComponent(API_BASE)}`;
    cache.set(key, { current: '1.0', versions: { '1.0': contract } });

    service.load();

    expect(service.contract()?.schema_version).toBe('1.0');
    http
      .expectOne(`${API_BASE}/status/sampler_constraints`)
      .flush({ ...contract, schema_version: '2.0' });
    expect(service.contract()?.schema_version).toBe('1.0');
  });

  it('stores accepted documents by API origin and schema version', () => {
    service.load();
    http.expectOne(`${API_BASE}/status/sampler_constraints`).flush(contract);

    expect(service.contract()?.samplers['k_euler']).toBeDefined();
    expect(store).toHaveBeenCalledWith(
      `aihorde.generate.sampler_constraints.${encodeURIComponent(API_BASE)}`,
      {
        current: '1.0',
        versions: { '1.0': expect.objectContaining({ schema_version: '1.0' }) },
      },
    );
  });
});
