import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { HomepageIntroComponent } from './homepage-intro.component';

describe('HomepageIntroComponent', () => {
  let component: HomepageIntroComponent;
  let fixture: ComponentFixture<HomepageIntroComponent>;
  let injectedDoc: Document;

  function createComponent(platformId: string) {
    TestBed.configureTestingModule({
      imports: [
        HomepageIntroComponent,
        RouterModule.forRoot([]),
        TranslocoTestingModule.forRoot({
          langs: { en: {} },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        }),
      ],
      providers: [{ provide: PLATFORM_ID, useValue: platformId }],
    }).compileComponents();

    injectedDoc = TestBed.inject(DOCUMENT);
    fixture = TestBed.createComponent(HomepageIntroComponent);
    component = fixture.componentInstance;
  }

  describe('in browser environment', () => {
    beforeEach(() => createComponent('browser'));

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should use injected DOCUMENT for getElementById', () => {
      const mockElement = {
        scrollIntoView: jasmine.createSpy('scrollIntoView'),
      };
      spyOn(injectedDoc, 'getElementById').and.returnValue(
        mockElement as unknown as HTMLElement,
      );

      const event = new Event('click');
      spyOn(event, 'preventDefault');

      component.scrollToFragment('quickstart', event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(injectedDoc.getElementById).toHaveBeenCalledWith('quickstart');
      expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
    });

    it('should not scroll if element is not found', () => {
      spyOn(injectedDoc, 'getElementById').and.returnValue(null);

      const event = new Event('click');
      component.scrollToFragment('nonexistent', event);

      expect(injectedDoc.getElementById).toHaveBeenCalledWith('nonexistent');
    });
  });

  describe('in server environment', () => {
    beforeEach(() => createComponent('server'));

    it('should not access document on server', () => {
      spyOn(injectedDoc, 'getElementById');

      const event = new Event('click');
      spyOn(event, 'preventDefault');

      component.scrollToFragment('quickstart', event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(injectedDoc.getElementById).not.toHaveBeenCalled();
    });
  });
});
