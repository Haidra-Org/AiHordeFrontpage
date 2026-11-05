import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppLandingComponent } from './app-landing.component';
import { AuthService } from '../../services/auth.service';
import { HordeUser } from '../../types/horde-user';
import en from '../../../assets/i18n/en.json';

const user = signal<HordeUser | null>(null);
const kudos = signal<number | null>(null);

describe('AppLandingComponent', () => {
  let fixture: ComponentFixture<AppLandingComponent>;

  const doors = (): HTMLButtonElement[] =>
    Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLButtonElement>('button.gs-door'),
    );

  const text = (): string =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(async () => {
    user.set(null);
    kudos.set(null);
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        AppLandingComponent,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: user.asReadonly(),
            kudos: kudos.asReadonly(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppLandingComponent);
    fixture.detectChanges();
  });

  it('offers the four places the app opens onto', () => {
    expect(doors()).toHaveLength(4);
    expect(text()).toContain('Generate images');
    expect(text()).toContain('Alchemy');
    expect(text()).toContain('Docs');
    expect(text()).toContain('Your account');
    expect(text()).not.toContain('app_landing.');
  });

  it('sends each door where it says it goes', () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    for (const door of doors()) {
      door.click();
    }

    expect(navigate.mock.calls.map((call) => call[0])).toEqual([
      '/generate/image',
      '/generate/alchemy',
      '/docs',
      '/profile',
    ]);
  });

  it('names the signed-in reader and their balance on the account door', () => {
    user.set({ username: 'someone#1', kudos: 1234 } as HordeUser);
    kudos.set(1234);
    fixture.detectChanges();

    const account = doors()[3];
    expect(account.textContent).toContain('someone#1');
    expect(account.textContent).toContain('1,234 kudos');
  });

  it('leaves the account door plain when nobody is signed in', () => {
    const account = doors()[3];
    expect(account.textContent).toContain('Kudos balance and your workers.');
  });
});
