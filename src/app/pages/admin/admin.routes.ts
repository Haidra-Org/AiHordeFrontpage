import { Routes } from '@angular/router';
import { authGuard, moderatorGuard } from '../../guards/admin.guard';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(
        (c) => c.DashboardComponent
      ),
  },
  {
    path: 'workers',
    loadComponent: () =>
      import('./workers/worker-list.component').then(
        (c) => c.WorkerListComponent
      ),
  },
  {
    path: 'users',
    canActivate: [moderatorGuard],
    loadComponent: () =>
      import('./users/user-management.component').then(
        (c) => c.UserManagementComponent
      ),
  },
  {
    path: 'users/:userId',
    canActivate: [moderatorGuard],
    loadComponent: () =>
      import('./users/user-management.component').then(
        (c) => c.UserManagementComponent
      ),
  },
];
