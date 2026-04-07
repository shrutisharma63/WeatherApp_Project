import { Component, ViewChild, ViewChildren, QueryList, ElementRef, AfterViewInit, ChangeDetectorRef, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WeatherService, WeatherData } from '../../services/weather.service';

import {
  Chart,
  Plugin,
  LineController,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js';

Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface HourlyForecast {
  time: string;
  icon: string;
  temp: number;
  description: string;
  isCurrent: boolean;
}

interface RainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  alpha: number;
  width: number;
  sway: number;
}

interface RainSlot {
  active: boolean;
  probability: number;
  storm: boolean;
}

interface RainSegment {
  id: number;
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  intensity: number;
  storm: boolean;
}

interface SplashParticle {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  vx: number;
}

@Component({
  selector: 'app-modern-weather-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modern-weather-dashboard.component.html',
  styleUrls: ['./modern-weather-dashboard.component.css']
})
export class ModernWeatherDashboardComponent implements AfterViewInit, OnDestroy {
  @ViewChild('tempChart') tempChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chartContainer') chartContainerRef!: ElementRef<HTMLDivElement>;
  @ViewChildren('rainSegmentCanvas') rainSegmentCanvasRefs!: QueryList<ElementRef<HTMLCanvasElement>>;

  private rainChancePlugin: Plugin<'line'> = {
    id: 'rainChanceDrops',
    afterDatasetsDraw: (chart) => {
      const points = chart.getDatasetMeta(0)?.data || [];
      if (!points.length || !this.rainData.length) {
        return;
      }

      const ctx = chart.ctx;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';

      points.forEach((point: any, index: number) => {
        const rainChance = this.rainData[index] ?? 0;
        if (rainChance <= 0) {
          return;
        }

        const yOffset = rainChance >= 40 ? 18 : 12;
        ctx.font = rainChance >= 40 ? '14px sans-serif' : '12px sans-serif';
        ctx.fillStyle = rainChance >= 40 ? '#38bdf8' : '#7dd3fc';
        ctx.fillText('💧', point.x, point.y - yOffset);
      });

      ctx.restore();
    }
  };
  
  tempChartData = {
    labels: [] as string[],
    datasets: [{
      label: 'Temperature',
      data: [] as number[],
      borderColor: '#f97316',
      backgroundColor: 'rgba(249, 115, 22, 0.2)',
      borderWidth: 3,
      tension: 0.4,
      fill: true,
      pointBackgroundColor: '#ffffff',
      pointBorderColor: '#f97316',
      pointBorderWidth: 2,
      pointRadius: 6,
      pointHoverRadius: 8,
      pointHoverBackgroundColor: '#f97316',
      pointHoverBorderColor: '#ffffff',
      pointHoverBorderWidth: 2
    }]
  };

  tempChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index'
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.9)',
        titleColor: 'white',
        bodyColor: 'rgba(255,255,255,0.9)',
        borderColor: 'rgba(255,255,255,0.2)',
        borderWidth: 1,
        cornerRadius: 12,
        displayColors: false,
        callbacks: {
          title: (tooltipItems: any) => `${tooltipItems[0].label}`,
          label: (context: any) => {
            const index = context.dataIndex;
            const rainChance = this.rainData[index] ?? 0;
            return [`${context.parsed.y}°`, `Rain: ${rainChance}%`];
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255,255,255,0.1)',
          drawBorder: false
        },
        ticks: {
          color: 'rgba(255,255,255,0.7)',
          font: {
            size: 12,
            weight: '500'
          },
          padding: 12
        }
      },
      y: {
        min: 0,
        max: 40,
        grid: {
          color: 'rgba(255,255,255,0.08)',
          drawBorder: false
        },
        ticks: {
          color: 'rgba(255,255,255,0.5)',
          font: {
            size: 11
          },
          callback: (value: number | string) => `${value}°`
        }
      }
    },
    elements: {
      point: {
        hoverBorderWidth: 3
      }
    },
    animation: {
      duration: 2000,
      easing: 'easeOutQuart'
    }
  };

  private chartInstance: Chart | null = null;
  private rainSegments: RainSegment[] = [];
  private rainSlots: RainSlot[] = [];
  private segmentDrops = new Map<number, RainDrop[]>();
  private segmentContexts = new Map<number, CanvasRenderingContext2D>();
  private segmentCanvases = new Map<number, HTMLCanvasElement>();
  private segmentStormFlash = new Map<number, number>();
  private segmentSplashes = new Map<number, SplashParticle[]>();
  private rainAnimationFrame: number | null = null;
  private lastFrameTs = 0;
  private resizeObserver: ResizeObserver | null = null;

  hourlyData: HourlyForecast[] = [];
  rainData: number[] = [];
  rainSegmentViews: Array<{ id: number; left: number; top: number; width: number; height: number; intensity: number; storm: boolean }> = [];
  sunrise = '--';
  sunset = '--';

  constructor(
    private cdr: ChangeDetectorRef,
    public weatherService: WeatherService
  ) {
    effect(() => {
      const weather = this.weatherService.currentWeather();
      this.applyWeatherData(weather);
    });
  }

  ngAfterViewInit() {
    this.createChart();
    this.initializeRainSegmentLayer();
  }

  private createChart() {
    if (this.tempChartRef) {
      this.chartInstance = new Chart(this.tempChartRef.nativeElement, {
        data: this.tempChartData,
        plugins: [this.rainChancePlugin],
        options: this.tempChartOptions as any,
        type: 'line'
      });
    }
  }

  private initializeRainSegmentLayer(): void {
    this.rainSegmentCanvasRefs.changes.subscribe(() => {
      this.bindRainSegmentCanvases();
    });

    if (this.chartContainerRef) {
      this.resizeObserver = new ResizeObserver(() => {
        this.syncRainSegmentsToChart();
      });
      this.resizeObserver.observe(this.chartContainerRef.nativeElement);
    }
  }

  private bindRainSegmentCanvases(): void {
    this.segmentContexts.clear();
    this.segmentCanvases.clear();

    const refs = this.rainSegmentCanvasRefs.toArray();
    refs.forEach((ref, index) => {
      const segment = this.rainSegmentViews[index];
      if (!segment) {
        return;
      }

      const canvas = ref.nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }

      this.resizeSegmentCanvas(canvas, ctx);
      this.segmentCanvases.set(segment.id, canvas);
      this.segmentContexts.set(segment.id, ctx);
    });

    const activeIds = new Set(this.rainSegmentViews.map((s) => s.id));
    Array.from(this.segmentDrops.keys()).forEach((id) => {
      if (!activeIds.has(id)) {
        this.segmentDrops.delete(id);
        this.segmentStormFlash.delete(id);
        this.segmentSplashes.delete(id);
      }
    });

    this.seedSegmentDrops();
    this.updateRainAnimationState();
  }

  private resizeSegmentCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private applyWeatherData(weather: WeatherData | null): void {
    if (!weather || weather.hourly.length === 0) {
      return;
    }

    const currentIndex = this.findCurrentHourStartIndex(weather.hourly);
    const startIndex = Math.max(0, currentIndex - 1);
    const nextHours = weather.hourly.slice(startIndex, startIndex + 9);

    if (nextHours.length === 0) {
      return;
    }

    this.rainSlots = nextHours.map((hour) => {
      const probability = Math.round(hour.precipitationProbability || 0);
      const storm = hour.weatherCode >= 95;
      const rainyCode = (hour.weatherCode >= 51 && hour.weatherCode <= 67)
        || (hour.weatherCode >= 80 && hour.weatherCode <= 82)
        || storm;
      const active = probability > 40 || rainyCode;
      return { active, probability, storm };
    });

    const currentInSliceIndex = Math.max(0, currentIndex - startIndex);
    this.hourlyData = nextHours.map((hour, index) => ({
      time: this.formatHourLabel(
        hour.time,
        index === currentInSliceIndex,
        index > 0 ? nextHours[index - 1].time : null
      ),
      icon: this.weatherService.getWeatherIcon(hour.weatherCode),
      temp: Math.round(hour.temperature),
      description: this.weatherService.getWeatherDescription(hour.weatherCode),
      isCurrent: index === currentInSliceIndex
    }));

    this.rainData = nextHours.map((hour) => Math.round(hour.precipitationProbability || 0));

    this.tempChartData.labels = this.hourlyData.map((h) => h.time);
    const dataset: any = this.tempChartData.datasets[0];
    dataset.data = this.hourlyData.map((h) => h.temp);
    dataset.pointRadius = this.rainData.map((rain) => (rain >= 40 ? 8 : rain > 0 ? 6 : 4));
    dataset.pointHoverRadius = this.rainData.map((rain) => (rain >= 40 ? 10 : rain > 0 ? 8 : 6));
    dataset.pointBackgroundColor = this.rainData.map((rain) => (rain > 0 ? '#38bdf8' : '#ffffff'));
    dataset.pointBorderColor = this.rainData.map((rain) => (rain > 0 ? '#0ea5e9' : '#f97316'));

    const unitSymbol = this.weatherService.temperatureUnit() === 'fahrenheit' ? 'F' : 'C';
    this.tempChartData.datasets[0].label = `Temperature (°${unitSymbol})`;

    const temps = this.hourlyData.map((h) => h.temp);
    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    (this.tempChartOptions as any).scales.y.min = Math.floor(minTemp - 3);
    (this.tempChartOptions as any).scales.y.max = Math.ceil(maxTemp + 3);

    const today = weather.forecast[0];
    this.sunrise = today?.sunrise ? this.formatHour(today.sunrise) : '--';
    this.sunset = today?.sunset ? this.formatHour(today.sunset) : '--';

    if (this.chartInstance) {
      this.chartInstance.update();
      this.syncRainSegmentsToChart();
      this.updateRainAnimationState();
    }

    this.cdr.markForCheck();
  }

  private syncRainSegmentsToChart(): void {
    if (!this.chartInstance || this.rainSlots.length === 0) {
      this.rainSegments = [];
      this.rainSegmentViews = [];
      return;
    }

    const meta = this.chartInstance.getDatasetMeta(0);
    const points: any[] = meta?.data || [];
    const area = this.chartInstance.chartArea;
    if (!points.length || !area) {
      this.rainSegments = [];
      this.rainSegmentViews = [];
      return;
    }

    this.rainSegments = this.rainSlots
      .map((slot, i) => {
        if (!slot.active) {
          return null;
        }

        const point = points[i];
        if (!point) {
          return null;
        }

        const left = i === 0 ? area.left : (points[i - 1].x + point.x) / 2;
        const right = i === points.length - 1 ? area.right : (point.x + points[i + 1].x) / 2;
        const intensity = Math.max(0.3, Math.min(1, slot.probability / 100 + (slot.storm ? 0.2 : 0)));
        return {
          id: i,
          xStart: left,
          xEnd: right,
          yStart: area.top,
          yEnd: area.bottom,
          intensity,
          storm: slot.storm
        } as RainSegment;
      })
      .filter((segment): segment is RainSegment => !!segment);

    if (!this.rainSegments.length) {
      this.rainSegmentViews = [];
      this.segmentDrops.clear();
      this.segmentStormFlash.clear();
      this.segmentSplashes.clear();
      this.stopRainAnimation();
      return;
    }

    this.rainSegmentViews = this.rainSegments.map((segment) => ({
      id: segment.id,
      left: segment.xStart,
      top: segment.yStart,
      width: Math.max(8, segment.xEnd - segment.xStart),
      height: Math.max(10, segment.yEnd - segment.yStart),
      intensity: segment.intensity,
      storm: segment.storm
    }));

    queueMicrotask(() => {
      this.bindRainSegmentCanvases();
    });

    this.cdr.markForCheck();
  }

  private seedSegmentDrops(): void {
    this.rainSegmentViews.forEach((segment) => {
      const canvas = this.segmentCanvases.get(segment.id);
      if (!canvas) {
        return;
      }

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const targetDrops = Math.round(18 + segment.intensity * 56);
      const existing = this.segmentDrops.get(segment.id) ?? [];
      const splashes = this.segmentSplashes.get(segment.id) ?? [];

      while (existing.length < targetDrops) {
        existing.push(this.createDrop(width, height, segment.intensity, true));
      }
      if (existing.length > targetDrops) {
        existing.length = targetDrops;
      }

      this.segmentDrops.set(segment.id, existing);
      this.segmentSplashes.set(segment.id, splashes);
      if (!this.segmentStormFlash.has(segment.id)) {
        this.segmentStormFlash.set(segment.id, 0);
      }
    });
  }

  private createDrop(width: number, height: number, intensity: number, randomY = false): RainDrop {
    const y = randomY ? Math.random() * height : -Math.random() * height * 0.25;
    return {
      x: Math.random() * Math.max(1, width),
      y,
      length: 7 + Math.random() * 11,
      speed: 180 + Math.random() * 220 + intensity * 220,
      alpha: 0.16 + Math.random() * 0.34,
      width: 1 + Math.random() * 1.2,
      sway: (Math.random() - 0.5) * 0.22
    };
  }

  private updateRainAnimationState(): void {
    if (!this.rainSegmentViews.length) {
      this.stopRainAnimation();
      this.clearAllSegmentCanvases();
      return;
    }

    if (this.rainAnimationFrame === null) {
      this.lastFrameTs = 0;
      this.rainAnimationFrame = requestAnimationFrame((ts) => this.renderRainFrame(ts));
    }
  }

  private renderRainFrame(timestamp: number): void {
    if (!this.lastFrameTs) {
      this.lastFrameTs = timestamp;
    }

    const dt = Math.min(0.033, (timestamp - this.lastFrameTs) / 1000);
    this.lastFrameTs = timestamp;

    this.rainSegmentViews.forEach((segment) => {
      const canvas = this.segmentCanvases.get(segment.id);
      const ctx = this.segmentContexts.get(segment.id);
      const drops = this.segmentDrops.get(segment.id);
      const splashes = this.segmentSplashes.get(segment.id) ?? [];
      if (!canvas || !ctx || !drops) {
        return;
      }

      this.resizeSegmentCanvas(canvas, ctx);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);

      const bgAlpha = Math.min(0.22, 0.06 + segment.intensity * 0.16);
      const rainGradient = ctx.createLinearGradient(0, 0, 0, height);
      rainGradient.addColorStop(0, `rgba(147, 197, 253, ${bgAlpha * 0.35})`);
      rainGradient.addColorStop(0.75, `rgba(125, 211, 252, ${bgAlpha})`);
      rainGradient.addColorStop(1, `rgba(56, 189, 248, ${bgAlpha * 0.8})`);
      ctx.fillStyle = rainGradient;
      ctx.fillRect(0, 0, width, height);

      if (segment.storm && Math.random() < 0.006) {
        this.segmentStormFlash.set(segment.id, 0.16 + Math.random() * 0.18);
      }

      const flash = this.segmentStormFlash.get(segment.id) ?? 0;
      if (flash > 0) {
        ctx.fillStyle = `rgba(220,235,255,${flash})`;
        ctx.fillRect(0, 0, width, height);
        this.segmentStormFlash.set(segment.id, Math.max(0, flash - dt * 0.85));
      }

      ctx.save();
      ctx.shadowColor = 'rgba(125, 211, 252, 0.32)';
      ctx.shadowBlur = 2.2;
      ctx.lineCap = 'round';

      for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        drop.y += drop.speed * dt;
        drop.x += drop.sway * drop.speed * dt * 0.2;

        if (drop.y > height + 18 || drop.x < -10 || drop.x > width + 10) {
          if (Math.random() < 0.6) {
            this.spawnSplash(splashes, drop.x, height - 2, segment.intensity);
          }
          drops[i] = this.createDrop(width, height, segment.intensity, false);
          continue;
        }

        ctx.strokeStyle = `rgba(186, 230, 253, ${drop.alpha})`;
        ctx.lineWidth = drop.width;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.sway * 14, drop.y + drop.length);
        ctx.stroke();
      }

      for (let i = splashes.length - 1; i >= 0; i--) {
        const splash = splashes[i];
        splash.life -= dt;
        splash.x += splash.vx * dt;
        splash.radius += dt * 8;
        if (splash.life <= 0) {
          splashes.splice(i, 1);
          continue;
        }

        const alpha = Math.max(0, splash.life / splash.maxLife) * 0.55;
        ctx.strokeStyle = `rgba(186, 230, 253, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(splash.x, splash.y, splash.radius, Math.PI, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    });

    if (this.rainSegmentViews.length) {
      this.rainAnimationFrame = requestAnimationFrame((ts) => this.renderRainFrame(ts));
    } else {
      this.rainAnimationFrame = null;
    }
  }

  private spawnSplash(splashes: SplashParticle[], x: number, y: number, intensity: number): void {
    const count = intensity > 0.75 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      splashes.push({
        x: x + (Math.random() - 0.5) * 6,
        y,
        radius: 1 + Math.random() * 1.4,
        life: 0.18 + Math.random() * 0.14,
        maxLife: 0.18 + Math.random() * 0.14,
        vx: (Math.random() - 0.5) * 18
      });
    }
  }

  private clearAllSegmentCanvases(): void {
    this.segmentContexts.forEach((ctx, id) => {
      const canvas = this.segmentCanvases.get(id);
      if (!canvas) {
        return;
      }
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    });
  }

  private stopRainAnimation(): void {
    if (this.rainAnimationFrame !== null) {
      cancelAnimationFrame(this.rainAnimationFrame);
      this.rainAnimationFrame = null;
    }
    this.lastFrameTs = 0;
  }

  private formatHour(dateTime: string): string {
    if (!dateTime) return '--';
    const date = new Date(dateTime);
    if (Number.isNaN(date.getTime())) {
      return '--';
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: true
    });
    return formatter.format(date);
  }

  private formatHourLabel(dateTime: string, isCurrent: boolean, previousDateTime: string | null): string {
    if (isCurrent) {
      return 'Now';
    }

    if (!dateTime) {
      return '--';
    }

    const date = new Date(dateTime);
    if (Number.isNaN(date.getTime())) {
      return '--';
    }

    const hourLabel = this.formatHour(dateTime);
    if (!previousDateTime) {
      return hourLabel;
    }

    const prev = new Date(previousDateTime);
    if (Number.isNaN(prev.getTime())) {
      return hourLabel;
    }

    const dayChanged = prev.getDate() !== date.getDate()
      || prev.getMonth() !== date.getMonth()
      || prev.getFullYear() !== date.getFullYear();

    if (!dayChanged) {
      return hourLabel;
    }

    const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date);
    return `${weekday} ${hourLabel}`;
  }

  private findCurrentHourStartIndex(hourly: WeatherData['hourly']): number {
    if (!hourly.length) {
      return 0;
    }

    const now = Date.now();
    let latestPastIndex = -1;
    let latestPastTime = -Infinity;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < hourly.length; i++) {
      const timestamp = new Date(hourly[i].time).getTime();
      if (Number.isNaN(timestamp)) {
        continue;
      }

      const distance = Math.abs(timestamp - now);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }

      if (timestamp <= now && timestamp > latestPastTime) {
        latestPastTime = timestamp;
        latestPastIndex = i;
      }
    }

    return latestPastIndex >= 0 ? latestPastIndex : nearestIndex;
  }

  ngOnDestroy() {
    this.stopRainAnimation();
    this.resizeObserver?.disconnect();
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
  }
}

