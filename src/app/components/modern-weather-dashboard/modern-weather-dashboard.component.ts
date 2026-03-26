import { Component, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  Chart,
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

Chart.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

interface HourlyForecast {
  time: string;
  icon: string;
  temp: number;
}

@Component({
  selector: 'app-modern-weather-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modern-weather-dashboard.component.html',
  styleUrls: ['./modern-weather-dashboard.component.css']
})
export class ModernWeatherDashboardComponent implements AfterViewInit {
  @ViewChild('tempChart') tempChartRef!: ElementRef<HTMLCanvasElement>;
  
  tempChartData = {
    labels: ['12PM', '1PM', '2PM', '3PM', '4PM', '5PM', '6PM', '7PM'],
    datasets: [{
      label: 'Temperature',
      data: [79, 82, 85, 88, 87, 85, 82, 78],
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
          label: (context: any) => `${context.parsed.y}°`
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
        min: 70,
        max: 95,
        grid: {
          color: 'rgba(255,255,255,0.08)',
          drawBorder: false
        },
        ticks: {
          color: 'rgba(255,255,255,0.5)',
          font: {
            size: 11
          },
          callback: (value: number) => `${value}°`
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

  hourlyData: HourlyForecast[] = [
    { time: 'Now', icon: '☀️', temp: 82 },
    { time: '1 PM', icon: '🌤️', temp: 85 },
    { time: '2 PM', icon: '🌤️', temp: 87 },
    { time: '3 PM', icon: '⛅', temp: 88 },
    { time: '4 PM', icon: '☁️', temp: 86 },
    { time: '5 PM', icon: '🌥️', temp: 84 },
    { time: '6 PM', icon: '🌅', temp: 82 },
    { time: '7 PM', icon: '🌙', temp: 78 }
  ];

  rainData = [2, 0, 5, 1, 3, 0, 2];

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit() {
    this.createChart();
  }

  private createChart() {
    if (this.tempChartRef) {
      this.chartInstance = new Chart(this.tempChartRef.nativeElement, {
        data: this.tempChartData,
        options: this.tempChartOptions as any,
        type: 'line'
      });
    }
  }

  ngOnDestroy() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
  }
}

