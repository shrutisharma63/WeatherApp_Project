# Responsive Weather Dashboard - Implementation Plan

## Files to Edit:
1. src/app/components/sidebar/sidebar.component.css - Make sidebar collapsible drawer on mobile
2. src/app/components/sidebar/sidebar.component.html - Add hamburger toggle button  
3. src/styles.css - Add global responsive utilities and improve media queries
4. src/app/components/weather-display/weather-display.component.css - Stack grid properly on mobile
5. src/app/components/header/header.component.css - Ensure header is fixed and responsive

## Specific Changes:
1. **Sidebar:**
   - Desktop: Keep narrow icon-only sidebar (72px) that expands on hover/click
   - Mobile: Convert to collapsible drawer that slides in from left (off-canvas)
   - Add hamburger menu button that toggles sidebar on mobile
   
2. **Main Content:**
   - When sidebar is hidden on mobile, main content takes full width
   - Use CSS Grid/Flexbox for responsive stacking

3. **Font Scaling:**
   - Base font size 16px on desktop
   - Scale to 14px on tablet (768px)
   - Scale to 13px on mobile (480px)

4. **Icons & Buttons:**
   - Icons: Scale proportionally
   - Buttons: Touch-friendly minimum 44px tap targets

## Implementation Steps:
1. Modify sidebar CSS for mobile drawer behavior
2. Add overlay for mobile sidebar
3. Improve grid stacking on mobile
4. Enhance media queries throughout

## Followup:
- Test on actual devices or browser dev tools
- Verify hamburger menu functionality
