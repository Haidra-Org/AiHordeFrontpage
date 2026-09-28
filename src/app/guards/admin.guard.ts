import { inject, PLATFORM_ID } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  CanDeactivateFn,
  Router,
} from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, map, take } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Guard that checks if user is logged in.
 * Waits for auth service to initialize before making a decision.
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // If already initialized, check immediately
  if (auth.isInitialized()) {
    if (auth.isLoggedIn()) {
      return true;
    }
    return router.createUrlTree(['/profile']);
  }

  // Wait for initialization to complete
  return toObservable(auth.isInitialized).pipe(
    filter((initialized) => initialized),
    take(1),
    map(() => {
      if (auth.isLoggedIn()) {
        return true;
      }
      return router.createUrlTree(['/profile']);
    }),
  );
};

/**
 * Guard that prompts before navigating away when there are unsaved changes.
 */
export const unsavedChangesGuard: CanDeactivateFn<{
  isDirty: () => boolean;
}> = (component) => {
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) {
    return true;
  }

  if (component?.isDirty && component.isDirty()) {
    return confirm('You have unsaved changes. Leave this page?');
  }

  return true;
};

/**
 * Guard that checks if user is a moderator.
 * Waits for auth service to initialize before making a decision.
 */
export const moderatorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // If already initialized, check immediately
  if (auth.isInitialized()) {
    const user = auth.currentUser();
    if (user?.moderator) {
      return true;
    }
    if (auth.isLoggedIn()) {
      return router.createUrlTree(['/admin']);
    }
    return router.createUrlTree(['/profile']);
  }

  // Wait for initialization to complete
  return toObservable(auth.isInitialized).pipe(
    filter((initialized) => initialized),
    take(1),
    map(() => {
      const user = auth.currentUser();
      if (user?.moderator) {
        return true;
      }
      if (auth.isLoggedIn()) {
        return router.createUrlTree(['/admin']);
      }
      return router.createUrlTree(['/profile']);
    }),
  );
};

/**
 * Whether the page a navigation settled on is one only moderators can open:
 * a route on its path carries `moderatorGuard`. Keyed on the route, never on
 * the viewer, so a moderator on any other page sees it as everyone does.
 */
export function isModeratorRoute(root: ActivatedRouteSnapshot): boolean {
  for (
    let route: ActivatedRouteSnapshot | null = root;
    route;
    route = route.firstChild
  ) {
    if (route.routeConfig?.canActivate?.includes(moderatorGuard)) return true;
  }
  return false;
}
