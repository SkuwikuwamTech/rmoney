// Detect User Operating System
function detectOS() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform?.toLowerCase() || '';

  if (platform.includes('mac') || userAgent.includes('macintosh') || userAgent.includes('mac os')) {
    return 'mac';
  } else if (platform.includes('linux') || userAgent.includes('linux') || userAgent.includes('x11')) {
    return 'linux';
  } else if (platform.includes('win') || userAgent.includes('windows')) {
    return 'windows';
  }
  return 'windows';
}

document.addEventListener('DOMContentLoaded', () => {
  // Mobile Nav Toggle
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

  // OS Detection & Download Highlighting
  const userOS = detectOS();
  const osBadges = document.querySelectorAll('.user-detected-os');
  const osDownloadButtons = document.querySelectorAll(`[data-os="${userOS}"]`);

  osBadges.forEach(badge => {
    if (userOS === 'mac') {
      badge.textContent = 'macOS (Universal)';
    } else if (userOS === 'linux') {
      badge.textContent = 'Linux (.AppImage / .deb)';
    } else {
      badge.textContent = 'Windows 10 / 11';
    }
  });

  osDownloadButtons.forEach(btn => {
    btn.classList.add('ring-2', 'ring-indigo-400', 'ring-offset-2', 'ring-offset-slate-900');
  });

  // FAQ Accordion
  const faqToggles = document.querySelectorAll('.faq-toggle');
  faqToggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const content = toggle.nextElementSibling;
      const icon = toggle.querySelector('.faq-icon');
      
      content.classList.toggle('hidden');
      if (icon) {
        icon.classList.toggle('rotate-180');
      }
    });
  });
});
