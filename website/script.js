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

  // Interactive Sandbox Tabs (365-Day What-If Simulator & Debt Snowball/Avalanche)
  const tabBtnWhatIf = document.getElementById('tab-btn-whatif');
  const tabBtnDebt = document.getElementById('tab-btn-debt');
  const panelWhatIf = document.getElementById('demo-panel-whatif');
  const panelDebt = document.getElementById('demo-panel-debt');

  if (tabBtnWhatIf && tabBtnDebt && panelWhatIf && panelDebt) {
    tabBtnWhatIf.addEventListener('click', () => {
      panelWhatIf.classList.remove('hidden');
      panelWhatIf.classList.add('grid');
      panelDebt.classList.add('hidden');
      panelDebt.classList.remove('grid');
      tabBtnWhatIf.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
      tabBtnWhatIf.classList.remove('text-slate-400');
      tabBtnDebt.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
      tabBtnDebt.classList.add('text-slate-400');
    });

    tabBtnDebt.addEventListener('click', () => {
      panelDebt.classList.remove('hidden');
      panelDebt.classList.add('grid');
      panelWhatIf.classList.add('hidden');
      panelWhatIf.classList.remove('grid');
      tabBtnDebt.classList.add('bg-indigo-600', 'text-white', 'shadow-md');
      tabBtnDebt.classList.remove('text-slate-400');
      tabBtnWhatIf.classList.remove('bg-indigo-600', 'text-white', 'shadow-md');
      tabBtnWhatIf.classList.add('text-slate-400');
    });
  }

  // What-If Simulator Checkboxes
  const whatIfToggles = document.querySelectorAll('.whatif-toggle');
  const whatIfResetBtn = document.getElementById('whatif-reset-btn');
  const simEndingEl = document.getElementById('sim-ending-cash');
  const simNetDeltaEl = document.getElementById('sim-net-delta');
  const simLowestEl = document.getElementById('sim-lowest-cash');
  const simBadgeEl = document.getElementById('sim-solvency-badge');
  const simLinePath = document.getElementById('sim-line-path');
  const simAreaPath = document.getElementById('sim-area-path');

  function updateWhatIfSimulation() {
    if (!simEndingEl) return;
    const startCash = 34920;
    const baseNetAnnual = 17840; // Baseline +$17,840/yr net savings
    let extraAnnual = 0;
    let oneTimeImpact = 0;

    whatIfToggles.forEach((cb) => {
      if (cb.checked) {
        const monthly = parseFloat(cb.getAttribute('data-impact-monthly') || '0');
        const once = parseFloat(cb.getAttribute('data-impact-once') || '0');
        extraAnnual += monthly * 12;
        oneTimeImpact += once;
      }
    });

    const netFlow = baseNetAnnual + extraAnnual + oneTimeImpact;
    const endingCash = startCash + netFlow;
    const lowestCash = Math.min(startCash, startCash + oneTimeImpact + Math.min(0, extraAnnual * 0.35));

    simEndingEl.textContent = '$' + Math.round(endingCash).toLocaleString();
    simNetDeltaEl.textContent = (netFlow >= 0 ? '+$' : '-$') + Math.abs(Math.round(netFlow)).toLocaleString() + ' net flow';
    simNetDeltaEl.className = 'text-[11px] font-semibold ' + (netFlow >= 0 ? 'text-emerald-400' : 'text-rose-400');
    simLowestEl.textContent = '$' + Math.round(lowestCash).toLocaleString();

    if (lowestCash >= 25000) {
      simBadgeEl.textContent = '✓ Buffer Safe';
      simBadgeEl.className = 'text-[11px] text-emerald-400 font-semibold';
    } else {
      simBadgeEl.textContent = '⚡ Dip Alert';
      simBadgeEl.className = 'text-[11px] text-amber-400 font-semibold';
    }

    // Dynamically adjust SVG curve height based on endingCash
    const endY = Math.max(15, Math.min(148, 120 - ((endingCash - startCash) / 30000) * 95));
    const midY = Math.max(20, Math.min(150, (120 + endY) / 2 - (oneTimeImpact < 0 ? -12 : 4)));
    const q1Y = Math.max(20, Math.min(152, 120 - (oneTimeImpact < 0 ? -8 : 8)));
    if (simLinePath && simAreaPath) {
      const lineD = `M 0,120 Q 150,${Math.round(q1Y)} 300,${Math.round(midY)} T 600,${Math.round(endY)}`;
      simLinePath.setAttribute('d', lineD);
      simAreaPath.setAttribute('d', `${lineD} L 600,165 L 0,165 Z`);
    }
  }

  whatIfToggles.forEach((cb) => cb.addEventListener('change', updateWhatIfSimulation));
  if (whatIfResetBtn) {
    whatIfResetBtn.addEventListener('click', () => {
      whatIfToggles.forEach((cb) => (cb.checked = false));
      updateWhatIfSimulation();
    });
  }
  updateWhatIfSimulation();

  // Debt Snowball vs Avalanche Slider
  const debtSlider = document.getElementById('debt-extra-slider');
  const debtExtraLabel = document.getElementById('debt-extra-label');
  const debtAvalancheMonths = document.getElementById('debt-avalanche-months');
  const debtAvalancheSaved = document.getElementById('debt-avalanche-saved');
  const debtSnowballMonths = document.getElementById('debt-snowball-months');
  const debtSnowballSaved = document.getElementById('debt-snowball-saved');

  if (debtSlider) {
    debtSlider.addEventListener('input', () => {
      const extra = parseInt(debtSlider.value, 10) || 0;
      if (debtExtraLabel) debtExtraLabel.textContent = `+$${extra} / month`;

      const basePayment = 545; // $115 + $290 + $140 minimums
      const totalMonthly = basePayment + extra;
      const estMonths = Math.max(12, Math.round(27200 / totalMonthly));
      const savedInterest = Math.round(extra * 9.8 + (extra > 0 ? 390 : 0));
      const firstWinMonths = Math.max(4, Math.round(4200 / (115 + extra)));

      if (debtAvalancheMonths) debtAvalancheMonths.textContent = `${estMonths} Months`;
      if (debtAvalancheSaved) {
        debtAvalancheSaved.textContent =
          extra > 0
            ? `Saves ~$${savedInterest.toLocaleString()} in interest vs. minimums`
            : 'Baseline minimum payment timeline (54 months)';
      }
      if (debtSnowballMonths) debtSnowballMonths.textContent = `${estMonths + (extra > 0 ? 1 : 0)} Months`;
      if (debtSnowballSaved) {
        debtSnowballSaved.textContent = `First account eliminated in ${firstWinMonths} months`;
      }
    });
  }
});
