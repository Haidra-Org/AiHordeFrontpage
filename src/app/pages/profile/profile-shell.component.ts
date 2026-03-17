import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  PLATFORM_ID,
  Signal,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { ScrollFadeComponent } from '../../helper/scroll-fade.component';
import { StickyHeaderDirective } from '../../helper/sticky-header.directive';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { setPageTitle } from '../../helper/page-title';
import { AuthService } from '../../services/auth.service';
import { PageGuideService } from '../../services/page-guide.service';
import { GlossaryService } from '../../services/glossary.service';
import { ToggleCheckboxComponent } from '../../components/toggle-checkbox/toggle-checkbox.component';
import { PageIntroComponent } from '../../components/page-intro/page-intro.component';
import {
  JsonInspectorComponent,
  JsonInspectorSection,
} from '../../components/json-inspector/json-inspector.component';
import { JsonInspectorTriggerComponent } from '../../components/json-inspector-trigger/json-inspector-trigger.component';
import { IconComponent } from '../../components/icon/icon.component';
import { UserBadgesComponent } from '../../components/user-badges/user-badges.component';
import { UserKudosCardComponent } from '../../components/user-kudos-card/user-kudos-card.component';
import { UserStatsSummaryComponent } from '../../components/user-stats-summary/user-stats-summary.component';

const CONTACT_NAG_DISMISSED_STORAGE_KEY = 'profile_contact_nag_dismissed';

interface ProfileTabDefinition {
  slug: string;
  labelKey: string;
  iconName: string;
  badgeCount?: Signal<number>;
  notificationDot?: Signal<boolean>;
}

@Component({
  selector: 'app-profile-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    ReactiveFormsModule,
    ScrollFadeComponent,
    StickyHeaderDirective,
    ToggleCheckboxComponent,
    PageIntroComponent,
    JsonInspectorComponent,
    JsonInspectorTriggerComponent,
    IconComponent,
    UserBadgesComponent,
    UserKudosCardComponent,
    UserStatsSummaryComponent,
  ],
  templateUrl: './profile-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileShellComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  public readonly auth = inject(AuthService);
  public readonly guideService = inject(PageGuideService);
  private readonly glossary = inject(GlossaryService);

  // Active tab from route (mirrors details.component.ts pattern)
  public readonly activeTabKey = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let child = this.route.firstChild;
        while (child?.firstChild) {
          child = child.firstChild;
        }
        return (child?.snapshot?.data?.['tabKey'] as string) ?? 'profile';
      }),
    ),
    { initialValue: 'profile' },
  );

  // Asset counts for tab badges
  public readonly workerCount = computed(
    () => this.auth.currentUser()?.worker_ids?.length ?? 0,
  );
  public readonly styleCount = computed(
    () => this.auth.currentUser()?.styles?.length ?? 0,
  );
  public readonly sharedKeyCount = computed(
    () => this.auth.currentUser()?.sharedkey_ids?.length ?? 0,
  );

  // Contact nag
  public readonly contactNagDismissed = signal<boolean>(false);
  public readonly shouldSetContactNag = computed(() => {
    const user = this.auth.currentUser();
    if (!user) return false;
    const hasWorkers = (user.worker_ids?.length ?? 0) > 0;
    const hasContact = (user.contact?.trim().length ?? 0) > 0;
    return hasWorkers && !hasContact;
  });
  public readonly showContactNagNotifications = computed(
    () => this.shouldSetContactNag() && !this.contactNagDismissed(),
  );

  // JSON inspector
  public rawJsonOpen = signal(false);
  public rawJsonSections = computed<readonly JsonInspectorSection[]>(() => {
    const user = this.auth.currentUser();
    if (!user) return [];
    return [
      { id: 'user', label: 'User', value: user },
      {
        id: 'kudos-details',
        label: 'Kudos Details',
        value: user.kudos_details ?? {},
      },
      { id: 'records', label: 'Records', value: user.records ?? {} },
      {
        id: 'active-generations',
        label: 'Active Generations',
        value: user.active_generations ?? {},
      },
    ];
  });

  // Login form
  public loginError = signal<boolean>(false);
  public form = new FormGroup({
    apiKey: new FormControl<string>('', [Validators.required]),
    remember: new FormControl<boolean>(false),
  });

  // Tab definitions (data-driven)
  public readonly tabs: ProfileTabDefinition[] = [
    {
      slug: 'overview',
      labelKey: 'profile.tabs.profile',
      iconName: 'user-circle',
    },
    {
      slug: 'generations',
      labelKey: 'profile.tabs.your_generations',
      iconName: 'lightning',
    },
    {
      slug: 'records',
      labelKey: 'profile.tabs.detailed_records',
      iconName: 'clipboard',
    },
    {
      slug: 'workers',
      labelKey: 'profile.tabs.your_workers',
      iconName: 'server',
      badgeCount: this.workerCount,
    },
    { slug: 'teams', labelKey: 'profile.tabs.your_teams', iconName: 'users' },
    {
      slug: 'styles',
      labelKey: 'profile.tabs.styles',
      iconName: 'paintbrush',
      badgeCount: this.styleCount,
    },
    {
      slug: 'shared-keys',
      labelKey: 'profile.tabs.shared_keys',
      iconName: 'key',
      badgeCount: this.sharedKeyCount,
    },
    {
      slug: 'settings',
      labelKey: 'profile.tabs.settings',
      iconName: 'cog',
      notificationDot: this.showContactNagNotifications,
    },
  ];

  constructor() {
    this.glossary.registerPageContext({
      pageId: 'profile',
      pageTitleKey: 'profile.title',
      relevantTermIds: [
        'api_key',
        'kudos',
        'request',
        'worker',
        'team',
        'trusted',
        'megapixelsteps',
        'tokens',
      ],
      entries: [
        {
          id: 'profile-api-key',
          titleKey: 'help.glossary.terms.api_key.title',
          descriptionKey: 'help.glossary.terms.api_key.body',
        },
        {
          id: 'profile-kudos',
          titleKey: 'help.glossary.terms.kudos.title',
          descriptionKey: 'help.glossary.terms.kudos.body',
        },
        {
          id: 'profile-public-workers',
          titleKey: 'profile.public_workers_label',
          descriptionKey: 'profile.public_workers_desc',
        },
        {
          id: 'profile-requests',
          titleKey: 'profile.records.requests',
          descriptionKey:
            'help.glossary.page.profile.requests_made.description',
        },
        {
          id: 'profile-fulfillments',
          titleKey: 'profile.records.fulfillments',
          descriptionKey:
            'help.glossary.page.profile.requests_fulfilled.description',
        },
        {
          id: 'profile-total-fulfillments',
          titleKey: 'profile.fulfillments_label',
          descriptionKey:
            'help.glossary.page.profile.total_fulfillments.description',
        },
        {
          id: 'profile-kudos-generated',
          titleKey: 'profile.contributions_label',
          descriptionKey:
            'help.glossary.page.profile.kudos_generated.description',
        },
        {
          id: 'profile-kudos-accumulated',
          titleKey: 'profile.kudos_accumulated',
          descriptionKey: 'help.glossary.page.profile.accumulated.description',
        },
        {
          id: 'profile-kudos-gifted',
          titleKey: 'profile.kudos_gifted',
          descriptionKey: 'help.glossary.page.profile.gifted.description',
        },
        {
          id: 'profile-kudos-received',
          titleKey: 'profile.kudos_received',
          descriptionKey: 'help.glossary.page.profile.received.description',
        },
        {
          id: 'profile-kudos-recurring',
          titleKey: 'profile.kudos_recurring',
          descriptionKey: 'help.glossary.page.profile.recurring.description',
        },
        {
          id: 'profile-kudos-donated',
          titleKey: 'profile.kudos_donated',
          descriptionKey: 'help.glossary.page.profile.donated.description',
        },
        {
          id: 'profile-mps',
          titleKey: 'help.glossary.terms.megapixelsteps.title',
          descriptionKey: 'help.glossary.terms.megapixelsteps.body',
        },
        {
          id: 'profile-tokens',
          titleKey: 'help.glossary.terms.tokens.title',
          descriptionKey: 'help.glossary.terms.tokens.body',
        },
      ],
    });

    this.destroyRef.onDestroy(() => {
      this.glossary.clearPageContext();
    });
  }

  ngOnInit(): void {
    setPageTitle(this.translator, this.title, this.destroyRef, 'profile.title');

    this.footerColor.setDarkMode(true);
    this.contactNagDismissed.set(this.loadContactNagDismissed());

    this.form.controls.apiKey.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loginError.set(false);
      });
  }

  public login(): void {
    if (!this.form.valid) return;
    this.loginError.set(false);
    this.auth
      .login(this.form.value.apiKey!, this.form.value.remember ?? false)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        if (!user) {
          this.loginError.set(true);
        } else {
          this.form.reset();
        }
      });
  }

  public logout(): void {
    this.auth.logout();
  }

  public openRawJson(): void {
    this.rawJsonOpen.set(true);
  }

  public closeRawJson(): void {
    this.rawJsonOpen.set(false);
  }

  public dismissContactNagNotifications(): void {
    this.contactNagDismissed.set(true);
    this.storeContactNagDismissed(true);
  }

  private loadContactNagDismissed(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    try {
      return localStorage.getItem(CONTACT_NAG_DISMISSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private storeContactNagDismissed(value: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      if (value) {
        localStorage.setItem(CONTACT_NAG_DISMISSED_STORAGE_KEY, '1');
      } else {
        localStorage.removeItem(CONTACT_NAG_DISMISSED_STORAGE_KEY);
      }
    } catch {
      // localStorage may be unavailable
    }
  }
}
