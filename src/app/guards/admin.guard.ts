import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard that checks if user is logged in
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }

  // Redirect to profile/login page
  return router.createUrlTree(['/profile']);
};

/**
 * Guard that checks if user is a moderator
 */
export const moderatorGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const user = auth.currentUser();
  if (user?.moderator) {
    return true;
  }

  // Redirect to admin dashboard if logged in but not moderator
  if (auth.isLoggedIn()) {
    return router.createUrlTree(['/admin']);
  }

  // Redirect to login if not logged in
  return router.createUrlTree(['/profile']);
};
