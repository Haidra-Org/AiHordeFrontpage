import {
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
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoModule } from '@jsverse/transloco';
import { combineLatest, finalize } from 'rxjs';
import { TranslatorService } from '../../../services/translator.service';
import { AuthService } from '../../../services/auth.service';
import { AdminFilterService } from '../../../services/admin-filter.service';
import {
  FilterDetails,
  FilterRegex,
  FilterPromptSuspicion,
  getFilterTypeLabel,
  getFilterTypeOptions,
  FILTER_TYPE_LABELS,
} from '../../../types/filter';
import {
  AdminToastBarComponent,
  AdminToast,
} from '../../../components/admin/admin-toast-bar/admin-toast-bar.component';
import { highlightJson, stringifyAsJson } from '../../../helper/json-formatter';

type DialogType = 'create' | 'edit' | 'delete' | 'rawJson';
type TabType = 'filters' | 'compiled';

@Component({
  selector: 'app-filter-management',
  imports: [
    TranslocoPipe,
    TranslocoModule,
    FormsModule,
    AdminToastBarComponent,
  ],
  templateUrl: './filter-management.component.html',
  styleUrl: './filter-management.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilterManagementComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly filterService = inject(AdminFilterService);
  public readonly auth = inject(AuthService);

  // Tab state
  public activeTab = signal<TabType>('filters');

  // Filters list state
  public filters = signal<FilterDetails[]>([]);
  public loading = signal<boolean>(false);
  public searchQuery = signal<string>('');
  public filterTypeFilter = signal<number | null>(null);

  // Compiled regex state
  public compiledRegex = signal<FilterRegex[]>([]);
  public loadingCompiled = signal<boolean>(false);

  // Dialog state
  public dialogOpen = signal<boolean>(false);
  public dialogType = signal<DialogType>('create');
  public selectedFilter = signal<FilterDetails | null>(null);
  public isUpdating = signal<boolean>(false);

  // Form state for create/edit
  public formRegex = signal<string>('');
  public formFilterType = signal<number>(10);
  public formDescription = signal<string>('');
  public formReplacement = signal<string>('');
  public isDirty = signal<boolean>(false);

  // Prompt tester state
  public testPromptValue = signal<string>('');
  public testResult = signal<FilterPromptSuspicion | null>(null);
  public testing = signal<boolean>(false);
  public testerExpanded = signal<boolean>(false);

  // Toast notifications
  public toasts = signal<AdminToast[]>([]);

  // Filter type options for dropdowns
  public readonly filterTypeOptions = getFilterTypeOptions();
  public readonly filterTypeLabelFn = getFilterTypeLabel;

  // Computed: filtered list of filters
  public filteredFilters = computed(() => {
    let result = this.filters();
    const query = this.searchQuery().toLowerCase().trim();
    const typeFilter = this.filterTypeFilter();

    if (query) {
      result = result.filter(
        (f) =>
          f.regex.toLowerCase().includes(query) ||
          (f.description?.toLowerCase().includes(query) ?? false) ||
          f.user.toLowerCase().includes(query) ||
          f.id.toLowerCase().includes(query),
      );
    }

    if (typeFilter !== null) {
      result = result.filter((f) => f.filter_type === typeFilter);
    }

    return result;
  });

  // Computed: JSON for raw view
  public selectedFilterJson = computed(() =>
    stringifyAsJson(this.selectedFilter()),
  );
  public selectedFilterJsonHighlighted = computed(() =>
    highlightJson(this.selectedFilterJson()),
  );
  public allFiltersJson = computed(() => stringifyAsJson(this.filters()));
  public allFiltersJsonHighlighted = computed(() =>
    highlightJson(this.allFiltersJson()),
  );
  public compiledRegexJson = computed(() =>
    stringifyAsJson(this.compiledRegex()),
  );
  public compiledRegexJsonHighlighted = computed(() =>
    highlightJson(this.compiledRegexJson()),
  );

  ngOnInit(): void {
    combineLatest([
      this.translator.get('admin.filters.title'),
      this.translator.get('app_title'),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([filtersTitle, appTitle]) => {
        this.title.setTitle(`${filtersTitle} | ${appTitle}`);
      });

    // Load filters on init
    this.loadFilters();
  }

  // Tab switching
  public switchTab(tab: TabType): void {
    this.activeTab.set(tab);
    if (tab === 'compiled' && this.compiledRegex().length === 0) {
      this.loadCompiledRegex();
    }
  }

  // Load all filters
  public loadFilters(): void {
    this.loading.set(true);
    this.filterService
      .getFilters()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (filters) => {
          this.filters.set(filters);
        },
        error: () => {
          this.showToast('error', 'Failed to load filters.');
        },
      });
  }

  // Load compiled regex
  public loadCompiledRegex(): void {
    this.loadingCompiled.set(true);
    this.filterService
      .getCompiledRegex()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loadingCompiled.set(false)),
      )
      .subscribe({
        next: (regex) => {
          this.compiledRegex.set(regex);
        },
        error: () => {
          this.showToast('error', 'Failed to load compiled regex.');
        },
      });
  }

  // Search/filter handlers
  public onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value);
  }

  public onFilterTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const value = target.value;
    this.filterTypeFilter.set(value ? parseInt(value, 10) : null);
  }

  public clearFilters(): void {
    this.searchQuery.set('');
    this.filterTypeFilter.set(null);
  }

  // Dialog actions
  public openCreateDialog(): void {
    this.formRegex.set('');
    this.formFilterType.set(10);
    this.formDescription.set('');
    this.formReplacement.set('');
    this.isDirty.set(false);
    this.dialogType.set('create');
    this.dialogOpen.set(true);
  }

  public openEditDialog(filter: FilterDetails): void {
    this.selectedFilter.set(filter);
    this.formRegex.set(filter.regex);
    this.formFilterType.set(filter.filter_type);
    this.formDescription.set(filter.description ?? '');
    this.formReplacement.set(filter.replacement ?? '');
    this.isDirty.set(false);
    this.dialogType.set('edit');
    this.dialogOpen.set(true);
  }

  public openDeleteDialog(filter: FilterDetails): void {
    this.selectedFilter.set(filter);
    this.dialogType.set('delete');
    this.dialogOpen.set(true);
  }

  public openRawJsonDialog(filter: FilterDetails): void {
    this.selectedFilter.set(filter);
    this.dialogType.set('rawJson');
    this.dialogOpen.set(true);
  }

  public closeDialog(): void {
    this.dialogOpen.set(false);
    this.selectedFilter.set(null);
  }

  // Form field handlers
  public onFormFieldChange(): void {
    this.isDirty.set(true);
  }

  public onFormRegexChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.formRegex.set(target.value);
    this.onFormFieldChange();
  }

  public onFormFilterTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.formFilterType.set(parseInt(target.value, 10));
    this.onFormFieldChange();
  }

  public onFormDescriptionChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.formDescription.set(target.value);
    this.onFormFieldChange();
  }

  public onFormReplacementChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.formReplacement.set(target.value);
    this.onFormFieldChange();
  }

  // CRUD operations
  public confirmDialog(): void {
    const dialogType = this.dialogType();

    if (dialogType === 'create') {
      this.createFilter();
    } else if (dialogType === 'edit') {
      this.updateFilter();
    } else if (dialogType === 'delete') {
      this.deleteFilter();
    } else if (dialogType === 'rawJson') {
      this.closeDialog();
    }
  }

  private createFilter(): void {
    const regex = this.formRegex().trim();
    if (!regex) {
      this.showToast('error', 'Regex pattern is required.');
      return;
    }

    this.isUpdating.set(true);
    this.filterService
      .createFilter({
        regex,
        filter_type: this.formFilterType(),
        description: this.formDescription().trim() || undefined,
        replacement: this.formReplacement() || undefined,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isUpdating.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            this.showToast('success', 'Filter created successfully.');
            this.closeDialog();
            this.loadFilters();
          } else {
            this.showToast('error', 'Failed to create filter.');
          }
        },
        error: () => {
          this.showToast('error', 'Failed to create filter.');
        },
      });
  }

  private updateFilter(): void {
    const filter = this.selectedFilter();
    if (!filter) return;

    const regex = this.formRegex().trim();
    if (!regex) {
      this.showToast('error', 'Regex pattern is required.');
      return;
    }

    this.isUpdating.set(true);
    this.filterService
      .updateFilter(filter.id, {
        regex,
        filter_type: this.formFilterType(),
        description: this.formDescription().trim() || undefined,
        replacement: this.formReplacement() || undefined,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isUpdating.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            this.showToast('success', 'Filter updated successfully.');
            this.closeDialog();
            this.loadFilters();
          } else {
            this.showToast('error', 'Failed to update filter.');
          }
        },
        error: () => {
          this.showToast('error', 'Failed to update filter.');
        },
      });
  }

  private deleteFilter(): void {
    const filter = this.selectedFilter();
    if (!filter) return;

    this.isUpdating.set(true);
    this.filterService
      .deleteFilter(filter.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isUpdating.set(false)),
      )
      .subscribe({
        next: (success) => {
          if (success) {
            this.showToast('success', 'Filter deleted successfully.');
            this.closeDialog();
            this.loadFilters();
          } else {
            this.showToast('error', 'Failed to delete filter.');
          }
        },
        error: () => {
          this.showToast('error', 'Failed to delete filter.');
        },
      });
  }

  // Prompt tester
  public toggleTester(): void {
    this.testerExpanded.set(!this.testerExpanded());
  }

  public onTestPromptChange(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.testPromptValue.set(target.value);
  }

  public testPrompt(): void {
    const prompt = this.testPromptValue().trim();
    if (!prompt) {
      this.showToast('error', 'Please enter a prompt to test.');
      return;
    }

    this.testing.set(true);
    this.testResult.set(null);

    this.filterService
      .testPrompt({ prompt })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.testing.set(false)),
      )
      .subscribe({
        next: (result) => {
          if (result) {
            this.testResult.set(result);
          } else {
            this.showToast('error', 'Failed to test prompt.');
          }
        },
        error: () => {
          this.showToast('error', 'Failed to test prompt.');
        },
      });
  }

  public clearTestResult(): void {
    this.testResult.set(null);
    this.testPromptValue.set('');
  }

  // Copy to clipboard
  public copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(
      () => this.showToast('success', 'Copied to clipboard.'),
      () => this.showToast('error', 'Failed to copy to clipboard.'),
    );
  }

  // Toast notification methods
  public showToast(
    type: AdminToast['type'],
    message: string,
    autoDismiss = type === 'success',
  ): void {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.toasts.update((current) => [...current, { id, type, message }]);

    if (autoDismiss) {
      setTimeout(() => this.dismissToast(id), 3000);
    }
  }

  public dismissToast(id: string): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }

  // Unsaved changes guard support
  public hasUnsavedChanges(): boolean {
    return this.isDirty() && this.dialogOpen();
  }

  // Helper to get filter type label (for template)
  public getTypeLabel(type: number): string {
    return FILTER_TYPE_LABELS[type] ?? `Unknown (${type})`;
  }
}
