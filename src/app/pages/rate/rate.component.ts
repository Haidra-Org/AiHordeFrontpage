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
import { TranslocoPipe } from '@jsverse/transloco';
import { IconComponent } from '../../components/icon/icon.component';
import { setPageTitle } from '../../helper/page-title';
import { AuthService } from '../../services/auth.service';
import { RatingsApiService } from '../../services/ratings-api.service';
import { TranslatorService } from '../../services/translator.service';
import { DatasetImagePopResponse } from '../../types/ratings';

interface RatingOption {
  value: number;
  labelKey: string;
}

interface ArtifactOption {
  value: number;
  labelKey: string;
}

@Component({
  selector: 'app-rate',
  imports: [TranslocoPipe, IconComponent],
  templateUrl: './rate.component.html',
  styleUrl: './rate.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RateComponent implements OnInit {
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly ratingsApi = inject(RatingsApiService);
  readonly auth = inject(AuthService);

  readonly currentImage = signal<DatasetImagePopResponse | null>(null);
  readonly selectedRating = signal<number | null>(null);
  readonly selectedArtifacts = signal<number | null>(null);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly lastReward = signal<number | null>(null);
  readonly error = signal<string | null>(null);

  readonly canSubmit = computed(
    () =>
      this.selectedRating() !== null &&
      this.selectedArtifacts() !== null &&
      this.currentImage() !== null &&
      !this.isSubmitting(),
  );

  readonly ratingOptions: RatingOption[] = [
    { value: 1, labelKey: 'rate.rating_1' },
    { value: 2, labelKey: 'rate.rating_2' },
    { value: 3, labelKey: 'rate.rating_3' },
    { value: 4, labelKey: 'rate.rating_4' },
    { value: 5, labelKey: 'rate.rating_5' },
    { value: 6, labelKey: 'rate.rating_6' },
    { value: 7, labelKey: 'rate.rating_7' },
    { value: 8, labelKey: 'rate.rating_8' },
    { value: 9, labelKey: 'rate.rating_9' },
    { value: 10, labelKey: 'rate.rating_10' },
  ];

  readonly artifactOptions: ArtifactOption[] = [
    { value: 0, labelKey: 'rate.artifacts_0' },
    { value: 1, labelKey: 'rate.artifacts_1' },
    { value: 2, labelKey: 'rate.artifacts_2' },
    { value: 3, labelKey: 'rate.artifacts_3' },
    { value: 4, labelKey: 'rate.artifacts_4' },
    { value: 5, labelKey: 'rate.artifacts_5' },
  ];

  constructor() {
    afterNextRender(() => {
      this.loadNextImage();
    });
  }

  ngOnInit(): void {
    setPageTitle(this.translator, this.title, this.destroyRef, 'rate.title');
  }

  loadNextImage(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.selectedRating.set(null);
    this.selectedArtifacts.set(null);

    this.ratingsApi
      .getNewImage()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (image) => {
          this.currentImage.set(image);
          this.isLoading.set(false);
        },
        error: () => {
          this.error.set('rate.error_no_images');
          this.isLoading.set(false);
        },
      });
  }

  selectRating(value: number): void {
    this.selectedRating.set(value);
  }

  selectArtifacts(value: number): void {
    this.selectedArtifacts.set(value);
  }

  submitRating(): void {
    const image = this.currentImage();
    const rating = this.selectedRating();
    const artifacts = this.selectedArtifacts();
    if (!image || rating === null || artifacts === null) return;

    this.isSubmitting.set(true);
    this.error.set(null);

    this.ratingsApi
      .submitRating(image.id, rating, artifacts)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.lastReward.set(response.reward);
          this.isSubmitting.set(false);
          this.loadNextImage();
        },
        error: () => {
          this.error.set('rate.error_submit');
          this.isSubmitting.set(false);
        },
      });
  }

  skipImage(): void {
    this.lastReward.set(null);
    this.loadNextImage();
  }
}
