import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, Observable, debounceTime, distinctUntilChanged } from 'rxjs';

export interface AppSettings {
  themeMode: 'light' | 'dark' | 'system';
  temperatureUnit: 'celsius' | 'fahrenheit';
  defaultLocation: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private readonly STORAGE_KEY = 'app_settings';

  // BehaviorSubject for reactive state management
  private settingsSubject = new BehaviorSubject<AppSettings>(this.getDefaultSettings());
  
  // Observable for components to subscribe to
  settings$: Observable<AppSettings> = this.settingsSubject.asObservable();

  // Signal-based approach for Angular 17+
  private _themeMode = signal<'light' | 'dark' | 'system'>('system');
  private _temperatureUnit = signal<'celsius' | 'fahrenheit'>('celsius');
  private _defaultLocation = signal<string>('');

  // Public signals
  themeMode = this._themeMode.asReadonly();
  temperatureUnit = this._temperatureUnit.asReadonly();
  defaultLocation = this._defaultLocation.asReadonly();

  constructor() {
    this.loadSettingsFromStorage();
    this.applyInitialTheme();
  }

  private getDefaultSettings(): AppSettings {
    return {
      themeMode: 'system',
      temperatureUnit: 'celsius',
      defaultLocation: ''
    };
  }

  // Load settings from LocalStorage
  private loadSettingsFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const settings = JSON.parse(stored) as AppSettings;
        this.settingsSubject.next(settings);
        
        // Update signals
        this._themeMode.set(settings.themeMode);
        this._temperatureUnit.set(settings.temperatureUnit);
        this._defaultLocation.set(settings.defaultLocation);
      }
    } catch (error) {
      console.error('Error loading settings from storage:', error);
    }
  }

  // Save settings to LocalStorage
  private saveSettingsToStorage(settings: AppSettings): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings to storage:', error);
    }
  }

  // Apply initial theme on app load
  private applyInitialTheme(): void {
    const settings = this.settingsSubject.getValue();
    this.applyTheme(settings.themeMode);
  }

  // Set theme mode
  setThemeMode(mode: 'light' | 'dark' | 'system'): void {
    const currentSettings = this.settingsSubject.getValue();
    const newSettings = { ...currentSettings, themeMode: mode };
    
    this.settingsSubject.next(newSettings);
    this._themeMode.set(mode);
    this.saveSettingsToStorage(newSettings);
    this.applyTheme(mode);
  }

  // Apply theme based on mode
  private applyTheme(mode: 'light' | 'dark' | 'system'): void {
    const body = document.body;
    body.classList.remove('light-theme', 'dark-theme');

    if (mode === 'system') {
      // Default to light theme for system preference
      body.classList.add('light-theme');
      
      // Listen for system theme changes
      this.setupSystemThemeListener();
    } else {
      body.classList.add(`${mode}-theme`);
    }
  }

  // Setup listener for system theme changes
  private setupSystemThemeListener(): void {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Remove previous listener if exists
    if (mediaQuery.onchange) {
      mediaQuery.onchange = null;
    }

    // Add new listener
    mediaQuery.onchange = (event: MediaQueryListEvent) => {
      const currentMode = this.settingsSubject.getValue().themeMode;
      if (currentMode === 'system') {
        const body = document.body;
        body.classList.remove('light-theme', 'dark-theme');
        body.classList.add('light-theme'); // Always light for system default
      }
    };
  }

  // Check if current theme is dark
  isDarkMode(): boolean {
    const body = document.body;
    return body.classList.contains('dark-theme');
  }

  // Set temperature unit
  setTemperatureUnit(unit: 'celsius' | 'fahrenheit'): void {
    const currentSettings = this.settingsSubject.getValue();
    const newSettings = { ...currentSettings, temperatureUnit: unit };
    
    this.settingsSubject.next(newSettings);
    this._temperatureUnit.set(unit);
    this.saveSettingsToStorage(newSettings);
  }

  // Set default location
  setDefaultLocation(location: string): void {
    const currentSettings = this.settingsSubject.getValue();
    const newSettings = { ...currentSettings, defaultLocation: location };
    
    this.settingsSubject.next(newSettings);
    this._defaultLocation.set(location);
    this.saveSettingsToStorage(newSettings);
  }

  // Get current settings
  getSettings(): AppSettings {
    return this.settingsSubject.getValue();
  }

  // Get RxJS observable with debounce for location search
  getLocationSearchObservable(location$: Observable<string>): Observable<string> {
    return location$.pipe(
      debounceTime(500), // Wait 500ms after user stops typing
      distinctUntilChanged() // Only emit if value is different
    );
  }
}

