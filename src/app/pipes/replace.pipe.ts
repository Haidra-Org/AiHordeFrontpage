import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'replace',
})
export class ReplacePipe implements PipeTransform {
  transform(value: string, replaceWhat: string, replaceWith: string): string {
    return value.replaceAll(replaceWhat, replaceWith);
  }
}
