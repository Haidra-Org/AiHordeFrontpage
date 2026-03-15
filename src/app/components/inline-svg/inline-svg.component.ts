import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { toPromise } from '../../types/resolvable';

@Component({
  selector: 'inline-svg',
  standalone: true,
  imports: [],
  templateUrl: './inline-svg.component.html',
  styleUrl: './inline-svg.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InlineSvgComponent implements OnInit {
  public href = input.required<string>();

  protected svgContent = signal<SafeHtml | null>(null);

  private readonly httpClient = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  private static readonly ALLOWED_PREFIXES = ['/assets/', 'assets/'];

  public async ngOnInit(): Promise<void> {
    const path = this.href();
    if (!InlineSvgComponent.ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
      console.error(`inline-svg: blocked untrusted path "${path}"`);
      return;
    }

    this.svgContent.set(
      this.sanitizer.bypassSecurityTrustHtml(
        await toPromise(
          this.httpClient.get(path, {
            responseType: 'text',
          }),
        ),
      ),
    );
  }
}
