const fs = require('fs');

// Favicon content
const faviconContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#38BDF8;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1D4ED8;stop-opacity:1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#0F172A" flood-opacity="0.2"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <ellipse cx="22" cy="38" rx="12" ry="10" fill="url(#cloudGrad)"/>
    <ellipse cx="36" cy="34" rx="16" ry="14" fill="url(#cloudGrad)"/>
    <ellipse cx="50" cy="38" rx="10" ry="9" fill="url(#cloudGrad)"/>
  </g>
  <ellipse cx="30" cy="32" rx="8" ry="6" fill="white" opacity="0.3"/>
</svg>`;

// Nimbus logo content
const nimbusContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="nimbusGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#38BDF8;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#0EA5E9;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1D4ED8;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="dropGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#38BDF8;stop-opacity:0.9" />
      <stop offset="100%" style="stop-color:#1E40AF;stop-opacity:0.85" />
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#0F172A" flood-opacity="0.2"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <ellipse cx="75" cy="145" rx="38" ry="35" fill="url(#nimbusGradient)" opacity="0.95"/>
    <ellipse cx="181" cy="145" rx="38" ry="35" fill="url(#nimbusGradient)" opacity="0.95"/>
    <ellipse cx="128" cy="125" rx="60" ry="50" fill="url(#nimbusGradient)"/>
    <ellipse cx="90" cy="135" rx="32" ry="38" fill="url(#nimbusGradient)" opacity="0.92"/>
    <ellipse cx="166" cy="135" rx="32" ry="38" fill="url(#nimbusGradient)" opacity="0.92"/>
    <ellipse cx="105" cy="85" rx="28" ry="28" fill="url(#nimbusGradient)" opacity="0.88"/>
    <ellipse cx="151" cy="82" rx="30" ry="30" fill="url(#nimbusGradient)" opacity="0.88"/>
  </g>
  <g>
    <path d="M95 195 Q88 212 95 230 Q102 212 95 195 Z" fill="url(#dropGrad)"/>
    <path d="M128 205 Q121 222 128 240 Q135 222 128 205 Z" fill="url(#dropGrad)"/>
    <path d="M161 195 Q154 212 161 230 Q168 212 161 195 Z" fill="url(#dropGrad)"/>
  </g>
  <ellipse cx="108" cy="105" rx="22" ry="18" fill="white" opacity="0.25"/>
</svg>`;

fs.writeFileSync('public/favicon.svg', faviconContent);
fs.writeFileSync('src/assets/nimbus-logo.svg', nimbusContent);

console.log('Logos updated successfully!');
