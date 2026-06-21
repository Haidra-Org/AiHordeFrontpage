import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { HordeApiCacheService, CacheTTL } from './horde-api-cache.service';
import { AuthService } from './auth.service';
import { STATUS_API_BASE_URL } from './api-config';
import {
  AdminAlertSummary,
  AdminComponent,
  AdminIncident,
  AdminMaintenance,
  AlertmanagerAlert,
  AlertPromotionRequest,
  ComponentOverrideRequest,
  IncidentCreateRequest,
  IncidentResolveRequest,
  IncidentTimelinePostRequest,
  IncidentUpdateRequest,
  MaintenanceCreateRequest,
} from '../types/status';

/**
 * Reads and writes the moderator-only surface of the status-page backend
 * (`ai-horde-service-alerts`, served under `/api/v1/internal/*`). Every call is
 * authorized with the logged-in user's AI Horde API key, the same key the
 * backend accepts for its `AiHordeApiKey` security scheme.
 *
 * Unlike {@link StatusService}, errors are deliberately NOT swallowed here: the
 * moderator UI needs to see auth failures and validation errors so it can
 * surface them, rather than silently rendering empty panels.
 */
@Injectable({ providedIn: 'root' })
export class StatusAdminService {
  private readonly httpClient = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cache = inject(HordeApiCacheService);
  private readonly internalUrl = `${inject(STATUS_API_BASE_URL)}/internal`;

  /** Auth header carrying the moderator API key, or empty when logged out. */
  private authOptions(): { headers?: Record<string, string> } {
    const apiKey = this.auth.getStoredApiKey();
    return apiKey ? { headers: { apikey: apiKey } } : {};
  }

  private get authHeaders(): { headers: Record<string, string> } {
    const apiKey = this.auth.getStoredApiKey() ?? '';
    return { headers: { apikey: apiKey } };
  }

  /**
   * Invalidate both the moderator caches and the public-page caches so a write
   * is reflected on the moderator panel and the public `/status` view alike.
   */
  private invalidateAll(): void {
    this.cache.invalidate({ category: 'status-admin' });
    this.cache.invalidate({ category: 'status' });
  }

  // ── Components ────────────────────────────────────────────────────────────

  public getComponents(): Observable<AdminComponent[]> {
    return this.cache.cachedGet<AdminComponent[]>(
      `${this.internalUrl}/components`,
      this.authOptions(),
      { ttl: CacheTTL.SHORT, category: 'status-admin' },
    );
  }

  public setComponentOverride(
    componentId: string,
    request: ComponentOverrideRequest,
  ): Observable<AdminComponent> {
    const id = encodeURIComponent(componentId);
    return this.httpClient
      .post<AdminComponent>(
        `${this.internalUrl}/components/${id}/override`,
        request,
        this.authHeaders,
      )
      .pipe(tap(() => this.invalidateAll()));
  }

  public clearComponentOverride(
    componentId: string,
  ): Observable<AdminComponent> {
    const id = encodeURIComponent(componentId);
    return this.httpClient
      .post<AdminComponent>(
        `${this.internalUrl}/components/${id}/override/clear`,
        {},
        this.authHeaders,
      )
      .pipe(tap(() => this.invalidateAll()));
  }

  // ── Incidents ─────────────────────────────────────────────────────────────

  public getIncidents(
    includeResolved = false,
    limit?: number,
  ): Observable<AdminIncident[]> {
    const params = new URLSearchParams();
    params.set('include_resolved', String(includeResolved));
    if (limit !== undefined) {
      params.set('limit', String(limit));
    }
    return this.cache.cachedGet<AdminIncident[]>(
      `${this.internalUrl}/incidents?${params.toString()}`,
      this.authOptions(),
      { ttl: CacheTTL.SHORT, category: 'status-admin' },
    );
  }

  public getIncident(incidentId: string): Observable<AdminIncident> {
    const id = encodeURIComponent(incidentId);
    return this.cache.cachedGet<AdminIncident>(
      `${this.internalUrl}/incidents/${id}`,
      this.authOptions(),
      { ttl: CacheTTL.SHORT, category: 'status-admin' },
    );
  }

  public createIncident(
    request: IncidentCreateRequest,
  ): Observable<AdminIncident> {
    return this.httpClient
      .post<AdminIncident>(
        `${this.internalUrl}/incidents`,
        request,
        this.authHeaders,
      )
      .pipe(tap(() => this.invalidateAll()));
  }

  public patchIncident(
    incidentId: string,
    request: IncidentUpdateRequest,
  ): Observable<AdminIncident> {
    const id = encodeURIComponent(incidentId);
    return this.httpClient
      .patch<AdminIncident>(
        `${this.internalUrl}/incidents/${id}`,
        request,
        this.authHeaders,
      )
      .pipe(tap(() => this.invalidateAll()));
  }

  public resolveIncident(
    incidentId: string,
    request: IncidentResolveRequest,
  ): Observable<AdminIncident> {
    const id = encodeURIComponent(incidentId);
    return this.httpClient
      .post<AdminIncident>(
        `${this.internalUrl}/incidents/${id}/resolve`,
        request,
        this.authHeaders,
      )
      .pipe(tap(() => this.invalidateAll()));
  }

  public postIncidentUpdate(
    incidentId: string,
    request: IncidentTimelinePostRequest,
  ): Observable<AdminIncident> {
    const id = encodeURIComponent(incidentId);
    return this.httpClient
      .post<AdminIncident>(
        `${this.internalUrl}/incidents/${id}/updates`,
        request,
        this.authHeaders,
      )
      .pipe(tap(() => this.invalidateAll()));
  }

  // ── Maintenance ───────────────────────────────────────────────────────────

  public getMaintenance(): Observable<AdminMaintenance[]> {
    return this.cache.cachedGet<AdminMaintenance[]>(
      `${this.internalUrl}/maintenance`,
      this.authOptions(),
      { ttl: CacheTTL.SHORT, category: 'status-admin' },
    );
  }

  public createMaintenance(
    request: MaintenanceCreateRequest,
  ): Observable<AdminMaintenance> {
    return this.httpClient
      .post<AdminMaintenance>(
        `${this.internalUrl}/maintenance`,
        request,
        this.authHeaders,
      )
      .pipe(tap(() => this.invalidateAll()));
  }

  public cancelMaintenance(windowId: string): Observable<AdminMaintenance> {
    const id = encodeURIComponent(windowId);
    return this.httpClient
      .post<AdminMaintenance>(
        `${this.internalUrl}/maintenance/${id}/cancel`,
        {},
        this.authHeaders,
      )
      .pipe(tap(() => this.invalidateAll()));
  }

  // ── Alerts + promotion ────────────────────────────────────────────────────

  public getAlerts(filters?: {
    active?: boolean;
    silenced?: boolean;
    inhibited?: boolean;
  }): Observable<AlertmanagerAlert[]> {
    const params = new URLSearchParams();
    if (filters?.active !== undefined)
      params.set('active', String(filters.active));
    if (filters?.silenced !== undefined)
      params.set('silenced', String(filters.silenced));
    if (filters?.inhibited !== undefined)
      params.set('inhibited', String(filters.inhibited));
    const query = params.toString();
    return this.cache.cachedGet<AlertmanagerAlert[]>(
      `${this.internalUrl}/alerts${query ? `?${query}` : ''}`,
      this.authOptions(),
      { ttl: CacheTTL.SHORT, category: 'status-admin' },
    );
  }

  public getAlertSummary(): Observable<AdminAlertSummary[]> {
    return this.cache.cachedGet<AdminAlertSummary[]>(
      `${this.internalUrl}/alerts/summary`,
      this.authOptions(),
      { ttl: CacheTTL.SHORT, category: 'status-admin' },
    );
  }

  public promoteAlert(
    fingerprint: string,
    request: AlertPromotionRequest,
  ): Observable<AdminIncident> {
    const fp = encodeURIComponent(fingerprint);
    return this.httpClient
      .post<AdminIncident>(
        `${this.internalUrl}/alerts/${fp}/promote`,
        request,
        this.authHeaders,
      )
      .pipe(tap(() => this.invalidateAll()));
  }
}
