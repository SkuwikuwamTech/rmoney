// Detect User Operating System
function detectOS() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform?.toLowerCase() || '';

  if (userAgent.includes('android')) {
    return 'android';
  } else if (platform.includes('mac') || userAgent.includes('macintosh') || userAgent.includes('mac os')) {
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
    if (userOS === 'android') {
      badge.textContent = 'Android (.apk)';
    } else if (userOS === 'mac') {
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

  // Dynamic Release Assets & Latest Version Resolution
  fetch('https://api.github.com/repos/SkuwikuwamTech/rmoney/releases/latest', {
    headers: { Accept: 'application/vnd.github.v3+json' },
  })
    .then((res) => {
      if (!res.ok) throw new Error('Release fetch status: ' + res.status);
      return res.json();
    })
    .then((data) => {
      if (!data) return;
      const tag = data.tag_name || 'v1.0.2';

      // Update version badge
      document.querySelectorAll('.latest-version-tag').forEach((el) => {
        el.textContent = tag;
      });

      if (!Array.isArray(data.assets)) return;

      const winExe = data.assets.find((a) => a.name.endsWith('.exe'));
      const winMsi = data.assets.find((a) => a.name.endsWith('.msi'));
      const macDmg = data.assets.find((a) => a.name.endsWith('.dmg'));
      const linuxAppImage = data.assets.find((a) => a.name.endsWith('.AppImage'));
      const linuxDeb = data.assets.find((a) => a.name.endsWith('.deb'));
      const androidApk = data.assets.find((a) => a.name.endsWith('.apk'));

      if (winExe) {
        document.querySelectorAll('a[data-asset="win-exe"]').forEach((a) => (a.href = winExe.browser_download_url));
      }
      if (winMsi) {
        document.querySelectorAll('a[data-asset="win-msi"]').forEach((a) => (a.href = winMsi.browser_download_url));
      }
      if (macDmg) {
        document.querySelectorAll('a[data-asset="mac-dmg"]').forEach((a) => (a.href = macDmg.browser_download_url));
      }
      if (linuxAppImage) {
        document.querySelectorAll('a[data-asset="linux-appimage"]').forEach((a) => (a.href = linuxAppImage.browser_download_url));
      } else if (linuxDeb) {
        document.querySelectorAll('a[data-asset="linux-appimage"]').forEach((a) => (a.href = linuxDeb.browser_download_url));
      }
      if (androidApk) {
        document.querySelectorAll('a[data-asset="android-apk"]').forEach((a) => (a.href = androidApk.browser_download_url));
      }
    })
    .catch((err) => {
      console.debug('[rMoney] Dynamic GitHub release metadata lookup:', err);
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
