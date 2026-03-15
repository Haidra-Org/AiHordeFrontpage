import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { debounceTime } from 'rxjs';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { TranslatorService } from '../../services/translator.service';
import { FooterColorService } from '../../services/footer-color.service';
import { ToggleCheckboxComponent } from '../../components/toggle-checkbox/toggle-checkbox.component';
import { DatabaseService, StorageType } from '../../services/database.service';
import { AiHordeService } from '../../services/ai-horde.service';
import { HordeUser } from '../../types/horde-user';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';
import { StickyRegistryService } from '../../services/sticky-registry.service';
import { scrollToElement } from '../../helper/scroll-utils';
import { SharedKeyService } from '../../services/shared-key.service';

@Component({
  selector: 'app-transfer',
  standalone: true,
  imports: [
    TranslocoPipe,
    TranslocoModule,
    ToggleCheckboxComponent,
    ReactiveFormsModule,
    FormatNumberPipe,
    RouterLink,
  ],
  templateUrl: './transfer.component.html',
  styleUrl: './transfer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransferComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly footerColor = inject(FooterColorService);
  private readonly database = inject(DatabaseService);
  private readonly aiHorde = inject(AiHordeService);
  private readonly sharedKeyService = inject(SharedKeyService);
  public readonly activatedRoute = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly stickyRegistry = inject(StickyRegistryService);

  private exampleUsers = signal(['db0#1', 'Tazlin#6572', 'Rikudou#185676']);

  public exampleUser = computed(() => {
    return this.exampleUsers()[
      Math.floor(Math.random() * this.exampleUsers().length)
    ];
  });
  public currentUser = signal<HordeUser | null>(null);
  public sentSuccessfully = signal<boolean | null>(null);
  public maximumKudos = computed(() => {
    if (!this.currentUser()) {
      return null;
    }

    return this.currentUser()!.kudos;
  });
  public educatorAccounts = signal<HordeUser[] | undefined>(undefined);
  public fragment = signal<string | null>(null);
  public validatedTargetKind = signal<'user' | 'sharedKey' | null>(null);
  public targetUserChecking = signal(false);

  constructor() {
    // Fetch educator accounts only in the browser after rendering completes.
    // This prevents stale prerendered data from appearing during static builds.
    afterNextRender(() => {
      this.aiHorde
        .getEducatorAccounts()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((accounts) => {
          this.educatorAccounts.set(accounts);
        });
    });
  }

  public form = new FormGroup({
    apiKey: new FormControl<string>('', [Validators.required]),
    remember: new FormControl<boolean>(false),
    targetUser: new FormControl<string>('', [Validators.required]),
    kudosAmount: new FormControl<number>(1, [
      Validators.required,
      Validators.min(1),
    ]),

    educatorAccount: new FormControl<number | null>(null),

    apiKeyValidated: new FormControl<boolean | null>(null, [
      Validators.requiredTrue,
    ]),
    targetUserValidated: new FormControl<boolean | null>(null, [
      Validators.requiredTrue,
    ]),
    kudosAmountValidated: new FormControl<boolean | null>(null, [
      Validators.requiredTrue,
    ]),
  });

  ngOnInit(): void {
    // Set title
    this.translator
      .get('transfer.title')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((transferTitle) => {
        this.translator.get('app_title').subscribe((appTitle) => {
          this.title.setTitle(`${transferTitle} | ${appTitle}`);
        });
      });

    this.footerColor.setDarkMode(true);

    const remember = this.database.get('remember_api_key', true);
    const apiKey = this.database.get(
      'api_key',
      remember ? StorageType.Permanent : StorageType.Session,
    ) as string | null;

    // Setup form value change subscriptions with automatic cleanup
    this.form.controls.apiKey.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.currentUser.set(null);
        this.validatedTargetKind.set(null);
        this.form.patchValue({ apiKeyValidated: null });
        if (this.form.controls.targetUser.value?.trim()) {
          this.form.patchValue({ targetUserValidated: null });
        }
      });

    this.form.controls.targetUser.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.targetUserChecking.set(false);
        this.validatedTargetKind.set(null);
        this.form.patchValue({ targetUserValidated: null });
      });

    this.form.controls.kudosAmount.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((kudosAmount) => {
        kudosAmount ??= 0;
        if (this.maximumKudos() === null) {
          this.form.patchValue({ kudosAmountValidated: null });
          return;
        }
        this.form.patchValue({
          kudosAmountValidated: kudosAmount <= this.maximumKudos()!,
        });
      });

    this.form.controls.educatorAccount.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((accountId) => {
        // @ts-expect-error string sentinel value from select control
        if (accountId === 'null') {
          accountId = null;
        }

        if (!accountId) {
          this.form.controls.targetUser.enable();
          this.form.patchValue({ targetUser: '' });
          return;
        }

        accountId = Number(accountId);
        const account = this.educatorAccounts()!.filter(
          (account) => account.id === accountId,
        )[0];

        this.form.controls.targetUser.disable();
        this.form.patchValue({ targetUser: account.username });
      });

    this.form.controls.apiKey.valueChanges
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(async (apiKey) => {
        if (!apiKey) {
          return;
        }

        this.aiHorde.getUserByApiKey(apiKey).subscribe((user) => {
          this.currentUser.set(user);
          this.form.patchValue({ apiKeyValidated: user !== null });
        });
      });

    this.form.controls.targetUser.valueChanges
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(async (targetUser) => {
        if (!targetUser) {
          this.targetUserChecking.set(false);
          return;
        }

        const normalizedTarget = targetUser.trim();
        if (!normalizedTarget) {
          this.targetUserChecking.set(false);
          this.validatedTargetKind.set(null);
          this.form.patchValue({ targetUserValidated: null });
          return;
        }

        this.targetUserChecking.set(true);

        const sourceApiKey = this.form.controls.apiKey.value?.trim();

        const parts = normalizedTarget.split('#');
        if (parts.length !== 2) {
          this.validateAsSharedKey(normalizedTarget, sourceApiKey);
          return;
        }

        const id = Number(parts[1]);
        if (Number.isNaN(id)) {
          this.validateAsSharedKey(normalizedTarget, sourceApiKey);
          return;
        }

        this.aiHorde.getUserById(id).subscribe((user) => {
          if (
            this.form.controls.targetUser.value?.trim() !== normalizedTarget
          ) {
            return;
          }

          this.targetUserChecking.set(false);

          const isUserMatch =
            user !== null &&
            normalizedTarget.toLowerCase() === user.username.toLowerCase();

          if (isUserMatch) {
            this.validatedTargetKind.set('user');
            this.form.patchValue({ targetUserValidated: true });
            return;
          }

          this.validateAsSharedKey(normalizedTarget, sourceApiKey);
        });
      });

    this.form.controls.targetUser.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((targetUser) => {
        if (targetUser?.trim()) {
          return;
        }

        this.validatedTargetKind.set(null);
      });

    this.form.patchValue({
      remember: remember,
    });
    if (apiKey) {
      this.form.patchValue({
        apiKey: apiKey,
      });
    }

    this.form.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.database.store('remember_api_key', value.remember ?? false);
        this.database.store(
          'api_key',
          value.apiKey ?? '',
          value.remember ? StorageType.Permanent : StorageType.Session,
        );

        this.sentSuccessfully.set(null);
      });

    this.activatedRoute.fragment
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((fragment) => {
        this.fragment.set(fragment);
        // Only scroll in browser environment (not during SSR)
        if (fragment && typeof document !== 'undefined') {
          const el = document.querySelector(`#${CSS.escape(fragment)}`);
          if (el instanceof HTMLElement) {
            scrollToElement(el, this.stickyRegistry.totalOffset());
          }
        }
      });
  }

  private validateAsSharedKey(
    sharedKeyId: string,
    sourceApiKey?: string,
  ): void {
    this.sharedKeyService.getSharedKey(sharedKeyId, sourceApiKey).subscribe({
      next: () => {
        if (this.form.controls.targetUser.value?.trim() !== sharedKeyId) {
          return;
        }

        this.targetUserChecking.set(false);

        this.validatedTargetKind.set('sharedKey');
        this.form.patchValue({
          targetUserValidated: true,
        });
      },
      error: () => {
        if (this.form.controls.targetUser.value?.trim() !== sharedKeyId) {
          return;
        }

        this.targetUserChecking.set(false);

        this.validatedTargetKind.set(null);
        this.form.patchValue({ targetUserValidated: false });
      },
    });
  }

  public transfer(): void {
    this.sentSuccessfully.set(null);
    if (!this.form.valid) {
      return;
    }

    this.aiHorde
      .transferKudos(
        this.form.value.apiKey!,
        this.form.controls.targetUser.value!,
        this.form.value.kudosAmount!,
      )
      .subscribe((success) => {
        this.sentSuccessfully.set(success);
      });
  }
}
