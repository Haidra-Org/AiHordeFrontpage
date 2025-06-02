import {Component, OnInit, signal} from '@angular/core';
import {toPromise} from "../../types/resolvable";
import {FooterColorService} from "../../services/footer-color.service";
import {NoSorterKeyValue} from "../../types/no-sorter-key-value";
import {TranslatorService} from "../../services/translator.service";
import {Title} from "@angular/platform-browser";
import {AiHordeService} from "../../services/ai-horde.service";

@Component({
  selector: 'app-privacy',
  standalone: true,

  templateUrl: './privacy.component.html',
  styleUrl: './privacy.component.scss'
})
export class PrivacyComponent implements OnInit {
  protected readonly NoSorterKeyValue = NoSorterKeyValue;
  public policy = signal<string | null>(null);

  constructor(
    private readonly footerColor: FooterColorService,
    private readonly translator: TranslatorService,
    private readonly titleService: Title,
    private readonly aiHorde: AiHordeService,
  ) {
  }

  public async ngOnInit(): Promise<void> {
    this.footerColor.setDarkMode(true);
    this.policy.set(await toPromise(this.aiHorde.privacyPolicy));
    this.titleService.setTitle(await toPromise(this.translator.get('privacy_policy')));
  }
}
