import { Directive, ElementRef, Input, HostListener, Renderer2 } from '@angular/core';

@Directive({
  selector: '[appTooltip]'
})
export class TooltipDirective {
  @Input('appTooltip') tooltipText: string = '';
  private tooltipElement: HTMLElement | null = null;

  constructor(private el: ElementRef, private renderer: Renderer2) {}

  @HostListener('mouseenter')
  onMouseEnter() {
    if (!this.tooltipText || this.tooltipElement) return;
    
    this.tooltipElement = this.renderer.createElement('span');
    this.renderer.setProperty(this.tooltipElement, 'textContent', this.tooltipText);
    this.renderer.addClass(this.tooltipElement, 'custom-tooltip');
    this.renderer.setStyle(this.tooltipElement, 'position', 'absolute');
    this.renderer.setStyle(this.tooltipElement, 'background-color', '#333');
    this.renderer.setStyle(this.tooltipElement, 'color', '#fff');
    this.renderer.setStyle(this.tooltipElement, 'padding', '5px 10px');
    this.renderer.setStyle(this.tooltipElement, 'border-radius', '4px');
    this.renderer.setStyle(this.tooltipElement, 'font-size', '12px');
    this.renderer.setStyle(this.tooltipElement, 'white-space', 'nowrap');
    this.renderer.setStyle(this.tooltipElement, 'z-index', '1000');
    this.renderer.setStyle(this.tooltipElement, 'right', '100%');
    this.renderer.setStyle(this.tooltipElement, 'top', '50%');
    this.renderer.setStyle(this.tooltipElement, 'transform', 'translateY(-50%)');
    this.renderer.setStyle(this.tooltipElement, 'margin-right', '5px');
    
    this.renderer.appendChild(this.el.nativeElement, this.tooltipElement);
    
    // Measure actual tooltip dimensions and adjust if it goes beyond screen
    requestAnimationFrame(() => {
      if (!this.tooltipElement) return;
      
      const tooltipRect = this.tooltipElement.getBoundingClientRect();
      const elementRect = this.el.nativeElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      // Check if tooltip goes beyond left edge of screen
      if (tooltipRect.left < 0) {
        // Move tooltip to right side instead
        this.renderer.setStyle(this.tooltipElement, 'right', 'auto');
        this.renderer.setStyle(this.tooltipElement, 'left', '100%');
        this.renderer.setStyle(this.tooltipElement, 'margin-right', '0');
        this.renderer.setStyle(this.tooltipElement, 'margin-left', '5px');
      }
    });
  }

  @HostListener('mouseleave')
  onMouseLeave() {
    if (this.tooltipElement) {
      this.renderer.removeChild(this.el.nativeElement, this.tooltipElement);
      this.tooltipElement = null;
    }
  }
}
