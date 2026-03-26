import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { SettingsService } from '../../services/settings.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-settings',
  standalone: true,
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
  imports: [ReactiveFormsModule, CommonModule]
})
export class SettingsComponent implements OnInit, OnDestroy {
  settingsForm: FormGroup;
  selectedTab: string = 'general';
  
  // For cleanup
  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private settingsService: SettingsService
  ) {
    // Initialize Reactive Form
    this.settingsForm = this.fb.group({
      themeMode: ['system'],
      temperatureUnit: ['celsius'],
      defaultLocation: ['']
    });
  }

  ngOnInit(): void {
    // Load saved settings into form
    const settings = this.settingsService.getSettings();
    this.settingsForm.patchValue({
      themeMode: settings.themeMode,
      temperatureUnit: settings.temperatureUnit,
      defaultLocation: settings.defaultLocation
    });

    // Subscribe to theme mode changes
    this.settingsForm.get('themeMode')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(mode => {
        this.settingsService.setThemeMode(mode);
      });

    // Subscribe to temperature unit changes
    this.settingsForm.get('temperatureUnit')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(unit => {
        this.settingsService.setTemperatureUnit(unit);
      });

    // Subscribe to location with debounce
    this.settingsForm.get('defaultLocation')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500),
        distinctUntilChanged()
      )
      .subscribe(location => {
        this.settingsService.setDefaultLocation(location);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  selectTab(tab: string): void {
    this.selectedTab = tab;
  }

  // Get theme mode for display
  get themeModeControl() {
    return this.settingsForm.get('themeMode');
  }

  // Get temperature unit for display
  get temperatureUnitControl() {
    return this.settingsForm.get('temperatureUnit');
  }

  // Get default location for display
  get defaultLocationControl() {
    return this.settingsForm.get('defaultLocation');
  }
}

