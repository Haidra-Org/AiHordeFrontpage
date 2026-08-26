import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, Routes } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { detailsRoutes } from './details.routes';

@Component({ template: '' })
class RouteStubComponent {}

/**
 * The real table with its lazy components swapped for a stub. What is under
 * test is which declaration a path lands on, so loading the pages themselves
 * would only add their dependencies to the run.
 */
function stubbed(routes: Routes): Routes {
  return routes.map((route) => {
    if (!route.loadComponent) return route;
    const { loadComponent: _ignored, ...rest } = route;
    return { ...rest, component: RouteStubComponent };
  });
}

describe('detailsRoutes', () => {
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'details', children: stubbed(detailsRoutes) }]),
      ],
    });
    router = TestBed.inject(Router);
  });

  it('sends the alchemy worker alias to the interrogation workers', async () => {
    await router.navigateByUrl('/details/workers/alchemy');

    expect(router.url).toBe('/details/workers/interrogation');
  });

  it('still resolves the worker types the alias sits among', async () => {
    for (const type of ['image', 'text', 'interrogation']) {
      await router.navigateByUrl(`/details/workers/${type}`);

      expect(router.url).toBe(`/details/workers/${type}`);
    }
  });
});
