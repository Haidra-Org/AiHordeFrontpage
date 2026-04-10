import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { vi } from 'vitest';
import {
  JsonInspectorComponent,
  JsonInspectorSection,
} from './json-inspector.component';

async function createComponent(platformId = 'browser'): Promise<{
  fixture: ComponentFixture<JsonInspectorComponent>;
  component: JsonInspectorComponent;
}> {
  await TestBed.configureTestingModule({
    imports: [JsonInspectorComponent],
    providers: [{ provide: PLATFORM_ID, useValue: platformId }],
  })
    .overrideComponent(JsonInspectorComponent, {
      set: { template: '' },
    })
    .compileComponents();

  const fixture = TestBed.createComponent(JsonInspectorComponent);
  return {
    fixture,
    component: fixture.componentInstance,
  };
}

describe('JsonInspectorComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('copyActiveSection copies active section JSON in browser', async () => {
    const { fixture, component } = await createComponent('browser');
    const writeText = vi.fn().mockResolvedValue(undefined);

    const sections: JsonInspectorSection[] = [
      {
        id: 'user',
        label: 'User',
        value: { id: 123, alias: 'test-user' },
      },
    ];

    fixture.componentRef.setInput('sections', sections);

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    await component.copyActiveSection();

    const expected = component.preparedSections()[0].json;
    expect(writeText).toHaveBeenCalledWith(expected);
  });

  it('copyActiveSection does not invoke clipboard in non-browser mode', async () => {
    const { fixture, component } = await createComponent('server');
    const writeText = vi.fn().mockResolvedValue(undefined);

    const sections: JsonInspectorSection[] = [
      {
        id: 'payload',
        label: 'Payload',
        value: { ok: true },
      },
    ];

    fixture.componentRef.setInput('sections', sections);

    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    } as unknown as Navigator);

    await component.copyActiveSection();

    expect(writeText).not.toHaveBeenCalled();
  });
});
