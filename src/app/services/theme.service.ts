import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private isDarkThemeSubject = new BehaviorSubject<boolean>(false);
  public isDarkTheme$ = this.isDarkThemeSubject.asObservable();

  constructor() {
    // Check for saved theme preference only in browser
    if (typeof window !== 'undefined') {
      try {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
          this.setDarkTheme(true);
        }
      } catch (e) {
        // Ignore errors during SSR
      }
    }
  }

  toggleTheme() {
    const current = this.isDarkThemeSubject.value;
    this.setDarkTheme(!current);
  }

  private setDarkTheme(isDark: boolean) {
    this.isDarkThemeSubject.next(isDark);
    if (typeof window !== 'undefined') {
      if (isDark) {
        document.body.classList.add('dark-theme');
        localStorage.setItem('theme', 'dark');
      } else {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('theme', 'light');
      }
    }
  }
}
