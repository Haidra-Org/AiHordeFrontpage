import { Component, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Title } from "@angular/platform-browser";
import { KeyValuePipe } from "@angular/common";
import { combineLatest, map } from 'rxjs';
import { TranslocoPipe, TranslocoModule } from "@jsverse/transloco";
import { DataService } from "../../services/data.service";
import { FaqItem } from "../../types/faq-item";
import { InlineSvgComponent } from "../../components/inline-svg/inline-svg.component";
import { TranslatorService } from "../../services/translator.service";
import { FooterColorService } from "../../services/footer-color.service";
import { SortedItems } from "../../types/sorted-items";
import { NoSorterKeyValue } from "../../types/no-sorter-key-value";

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [
    KeyValuePipe,
    TranslocoPipe,
    TranslocoModule,
    InlineSvgComponent
  ],
  templateUrl: './faq.component.html',
  styleUrl: './faq.component.scss'
})
export class FaqComponent implements OnInit {
  protected readonly NoSorterKeyValue = NoSorterKeyValue;
  private readonly title = inject(Title);
  private readonly translator = inject(TranslatorService);
  private readonly dataService = inject(DataService);
  private readonly footerColor = inject(FooterColorService);

  // Automatically unsubscribes when component is destroyed
  public readonly faq = toSignal(this.dataService.faq, { 
    initialValue: new Map<string, FaqItem[]>() as SortedItems<FaqItem> 
  });
  public selectedFaq = signal<string | null>(null);

  ngOnInit(): void {
    this.footerColor.setDarkMode(true);
    
    // Set title reactively
    combineLatest([
      this.translator.get('frequently_asked_questions'),
      this.translator.get('app_title')
    ]).pipe(
      map(([faq, app]) => `${faq} | ${app}`)
    ).subscribe(title => this.title.setTitle(title));
  }
}
