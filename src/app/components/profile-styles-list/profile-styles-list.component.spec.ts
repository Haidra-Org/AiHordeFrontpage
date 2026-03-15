import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Component, signal, DestroyRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { StyleService } from '../../services/style.service';
import { AuthService } from '../../services/auth.service';
import { ProfileStylesListComponent } from './profile-styles-list.component';
import { ImageStyle, TextStyle } from '../../types/style';

/**
 * These tests verify the key bug fix: style type detection.
 *
 * Previously the component tried the image endpoint first and fell back
 * to the text endpoint on error. This caused:
 *   1. Double API calls for every text style
 *   2. 400 errors ("Style was found but was of the wrong type")
 *   3. Quadrupled traffic triggering 429 rate limits
 *
 * The fix uses UserStyleReference.type (already in the user profile)
 * to call the correct endpoint directly.
 */
describe('ProfileStylesListComponent - type-aware style fetching', () => {
  let styleService: jasmine.SpyObj<StyleService>;
  let mockCurrentUser: ReturnType<typeof signal>;

  const mockImageStyle: ImageStyle = {
    id: 'img-1',
    name: 'Test Image Style',
    info: 'test',
    creator: 'user1',
    public: true,
    nsfw: false,
    tags: [],
    models: [{ name: 'SD' }],
    params: {},
    examples: [],
    uses: 10,
  } as any;

  const mockTextStyle: TextStyle = {
    id: 'txt-1',
    name: 'Test Text Style',
    info: 'test',
    creator: 'user1',
    public: true,
    nsfw: false,
    tags: [],
    models: [{ name: 'LLaMA' }],
    params: {},
    examples: [],
    uses: 5,
  } as any;

  beforeEach(() => {
    styleService = jasmine.createSpyObj('StyleService', [
      'getImageStyle',
      'getTextStyle',
      'createImageStyle',
      'createTextStyle',
      'deleteImageStyle',
      'deleteTextStyle',
    ]);

    mockCurrentUser = signal({
      id: 1,
      username: 'TestUser',
      kudos: 100,
      styles: [
        { id: 'img-1', type: 'image' },
        { id: 'txt-1', type: 'text' },
        { id: 'img-2', type: 'image' },
      ],
    });

    const authServiceMock = {
      currentUser: mockCurrentUser,
      getStoredApiKey: jasmine
        .createSpy('getStoredApiKey')
        .and.returnValue('test-key'),
    };

    TestBed.configureTestingModule({
      imports: [ProfileStylesListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideTransloco({
          config: { availableLangs: ['en'], defaultLang: 'en' },
        }),
        { provide: StyleService, useValue: styleService },
        { provide: AuthService, useValue: authServiceMock },
      ],
    });
  });

  it('should call getImageStyle for image-type refs (not getTextStyle)', () => {
    styleService.getImageStyle.and.returnValue(of(mockImageStyle));
    styleService.getTextStyle.and.returnValue(of(mockTextStyle));

    const fixture = TestBed.createComponent(ProfileStylesListComponent);
    fixture.detectChanges(); // triggers ngOnInit → loadUserStyles

    // img-1 is type: 'image' → should call getImageStyle
    expect(styleService.getImageStyle).toHaveBeenCalledWith('img-1');
    // img-2 is type: 'image' → should call getImageStyle
    expect(styleService.getImageStyle).toHaveBeenCalledWith('img-2');

    // getImageStyle should have been called exactly 2 times (for img-1 and img-2)
    expect(styleService.getImageStyle).toHaveBeenCalledTimes(2);
  });

  it('should call getTextStyle for text-type refs (not getImageStyle)', () => {
    styleService.getImageStyle.and.returnValue(of(mockImageStyle));
    styleService.getTextStyle.and.returnValue(of(mockTextStyle));

    const fixture = TestBed.createComponent(ProfileStylesListComponent);
    fixture.detectChanges();

    // txt-1 is type: 'text' → should call getTextStyle
    expect(styleService.getTextStyle).toHaveBeenCalledWith('txt-1');
    // getTextStyle should only be called once
    expect(styleService.getTextStyle).toHaveBeenCalledTimes(1);
  });

  it('should NOT call getTextStyle as a fallback for image styles', () => {
    // Even if image fetch fails, it should NOT try text endpoint
    styleService.getImageStyle.and.returnValue(
      throwError(() => new Error('Not found')),
    );
    styleService.getTextStyle.and.returnValue(of(mockTextStyle));

    const fixture = TestBed.createComponent(ProfileStylesListComponent);
    fixture.detectChanges();

    // getTextStyle should only be called for txt-1, NOT as fallback for img-1 or img-2
    expect(styleService.getTextStyle).toHaveBeenCalledTimes(1);
    expect(styleService.getTextStyle).toHaveBeenCalledWith('txt-1');
  });

  it('should correctly categorize fetched styles by type', () => {
    styleService.getImageStyle.and.returnValue(of(mockImageStyle));
    styleService.getTextStyle.and.returnValue(of(mockTextStyle));

    const fixture = TestBed.createComponent(ProfileStylesListComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const styles = component.userStyles();

    // Should have 3 total styles
    expect(styles.length).toBe(3);

    // First two should be image type
    const imageEntries = styles.filter((s) => s.type === 'image');
    expect(imageEntries.length).toBe(2);

    // One should be text type
    const textEntries = styles.filter((s) => s.type === 'text');
    expect(textEntries.length).toBe(1);

    // All should have loaded successfully
    const loaded = styles.filter((s) => !s.loading && !s.error && s.style);
    expect(loaded.length).toBe(3);
  });

  it('should handle fetch errors gracefully without wrong-type fallback', () => {
    // img-1 fails, img-2 succeeds, txt-1 succeeds
    styleService.getImageStyle.and.callFake((id: string) => {
      if (id === 'img-1') return throwError(() => new Error('404'));
      return of(mockImageStyle);
    });
    styleService.getTextStyle.and.returnValue(of(mockTextStyle));

    const fixture = TestBed.createComponent(ProfileStylesListComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const styles = component.userStyles();

    // img-1 should be marked as error
    const failedEntry = styles.find((s) => s.id === 'img-1');
    expect(failedEntry).toBeTruthy();
    expect(failedEntry!.error).toBe(true);
    expect(failedEntry!.style).toBeNull();
    expect(failedEntry!.type).toBe('image'); // Type preserved even on error

    // img-2 and txt-1 should be successful
    const img2 = styles.find((s) => s.id === 'img-2');
    expect(img2!.error).toBe(false);
    expect(img2!.style).toBeTruthy();

    const txt1 = styles.find((s) => s.id === 'txt-1');
    expect(txt1!.error).toBe(false);
    expect(txt1!.style).toBeTruthy();
  });

  it('should not load styles when external data is provided', () => {
    // Reset auth to user without styles (shouldn't matter since external is used)
    const fixture = TestBed.createComponent(ProfileStylesListComponent);

    // Simulate external data input
    fixture.componentRef.setInput('styles', [
      {
        id: 'ext-1',
        style: mockImageStyle,
        type: 'image',
        loading: false,
        error: false,
      },
    ]);
    fixture.detectChanges();

    // Should NOT have called any style fetch methods
    expect(styleService.getImageStyle).not.toHaveBeenCalled();
    expect(styleService.getTextStyle).not.toHaveBeenCalled();
  });

  it('should handle empty style refs', () => {
    mockCurrentUser.set({
      id: 1,
      username: 'TestUser',
      kudos: 100,
      styles: [],
    });

    const fixture = TestBed.createComponent(ProfileStylesListComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.userStyles().length).toBe(0);
    expect(styleService.getImageStyle).not.toHaveBeenCalled();
    expect(styleService.getTextStyle).not.toHaveBeenCalled();
  });
});
