import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MenuService {
  isMenuOpen = signal(false);
  currentView = signal('forecast'); // Default forecast

  toggleMenu() {
    this.isMenuOpen.set(!this.isMenuOpen());
  }

  setView(view: string) {
    this.currentView.set(view);
    this.isMenuOpen.set(false); // Close menu after selection
  }
}
