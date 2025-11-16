import './style.css';

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const WEEKS_RETRO = 19;

// --- WAGE TOGGLE LOGIC ---
document.getElementById('labelHourly').addEventListener('click', (e) => {
  const radio = document.getElementById('typeHourly');
  if (radio.checked) {
    e.preventDefault();
    document.getElementById('typeSalary').checked = true;
    updateWageInputs('salary');
  }
});
document.getElementById('labelSalary').addEventListener('click', (e) => {
  const radio = document.getElementById('typeSalary');
  if (radio.checked) {
    e.preventDefault();
    document.getElementById('typeHourly').checked = true;
    updateWageInputs('hourly');
  }
});
document.querySelectorAll('input[name="wageType"]').forEach((radio) => {
  radio.addEventListener('change', (e) => {
    updateWageInputs(e.target.value);
  });
});
function updateWageInputs(type) {
  const label = document.getElementById('startValLabel');
  const input = document.getElementById('startVal');
  if (type === 'salary') {
    label.innerText = 'Current Annual Salary ($)';
    input.placeholder = 'e.g. 62400';
  } else {
    label.innerText = 'Current Hourly Rate ($)';
    input.placeholder = 'e.g. 30.00';
  }
}

// --- AUTO-ENABLE STRIKE TOGGLE ---
document.getElementById('strikeDays').addEventListener('input', (e) => {
  // Listener kept for potential future UI responsiveness needs
});

// --- HELPER: Apply raise rules ---
function applyRaise(currentRate, pct, flat, floor) {
  let raisePct = currentRate * pct;
  let useFlat = flat > raisePct;
  let tempRate = currentRate + (useFlat ? flat : raisePct);
  let hitFloor = tempRate < floor;
  let finalRate = hitFloor ? floor : tempRate;
  let reason = hitFloor
    ? `Bumped to ${fmt.format(floor)} floor`
    : useFlat && flat > 0
    ? `Used flat ${fmt.format(flat)} increase`
    : `Used ${(pct * 100).toFixed(1)}% increase`;
  return { rate: finalRate, reason: reason };
}

function calculate() {
  const startVal = parseFloat(document.getElementById('startVal').value);
  const fte = parseFloat(document.getElementById('fte').value);
  const cpiPct = parseFloat(document.getElementById('cpiScenario').value);
  const strikeDays =
    parseFloat(document.getElementById('strikeDays').value) || 0;
  const strike = strikeDays > 0;
  const isSalaryInput =
    document.querySelector('input[name="wageType"]:checked').value === 'salary';

  if (!startVal) {
    alert('Please enter your current pay rate.');
    return;
  }

  const annualHours = 2080 * fte;
  let startHourly = isSalaryInput ? startVal / annualHours : startVal;

  let oRate = startHourly,
    aRate = startHourly,
    cpiRate = startHourly;
  let oGross = 0,
    aGross = 0;
  let html = '';

  // --- 1. CALCULATE YEARLY RATES FIRST ---
  let y1_cpi = startHourly * (1 + cpiPct);
  let y1_o = applyRaise(oRate, 0.04, 1.25, 22.0);
  let y1_a = applyRaise(aRate, 0.08, 5.0, 23.0);

  let y2_cpi = y1_cpi * (1 + cpiPct);
  let y2_o = applyRaise(y1_o.rate, 0.025, 0, 22.55);
  let y2_a = applyRaise(y1_a.rate, 0.05, 2.0, 25.0);

  let y3_cpi = y2_cpi * (1 + cpiPct);
  let y3_o = applyRaise(y2_o.rate, 0.025, 0, 23.11);
  let y3_a = applyRaise(y2_a.rate, 0.05, 2.0, 27.0);

  // --- 2. CALCULATE CASH/RETRO ---
  let ohsuBonusAvailable = fte >= 0.5 ? 1500 : 750;
  let ohsuCash = !strike ? ohsuBonusAvailable : 0;

  let hourlyIncrease = y1_a.rate - startHourly;
  let weeklyHours = fte * 40;
  let afscmeRetro = hourlyIncrease * weeklyHours * WEEKS_RETRO;

  // --- 3. TRADE-OFF ANALYSIS ---
  const strikeImpactBox = document.getElementById('strikeImpactBox');
  if (strike) {
    // COSTS
    const lostWages = startHourly * 8 * fte * strikeDays;
    const totalStrikeCost = lostWages + ohsuBonusAvailable;

    // GAINS
    let gain_Y1_wages = (y1_a.rate - y1_o.rate) * annualHours;
    let gain_Y1_total = gain_Y1_wages + afscmeRetro; // Wages + Retro
    let gain_Y2 = (y2_a.rate - y2_o.rate) * annualHours;
    let gain_Y3 = (y3_a.rate - y3_o.rate) * annualHours;

    // NET POSITIONS
    let netY1 = gain_Y1_total - totalStrikeCost;
    let netY2 = netY1 + gain_Y2;
    let netY3 = netY2 + gain_Y3;

    // BUILD ANALYSIS MESSAGE
    let boxHtml = `<h3>⚖️ Strike Trade-off Analysis</h3>`;

    // Section 1: The Costs
    boxHtml += `<p style="margin-bottom: 8px;"><strong>The Costs:</strong> Striking for ${strikeDays} days costs approx. <strong class="diff-negative">${fmt.format(
      totalStrikeCost
    )}</strong>.<br>`;
    boxHtml += `<span style="font-size: 0.9em; color: #666; margin-left: 10px;">(${fmt.format(
      lostWages
    )} lost wages + ${fmt.format(
      ohsuBonusAvailable
    )} lost OHSU bonus)</span></p>`;

    // Section 2: The Gains
    boxHtml += `<p style="margin-bottom: 8px;"><strong>The Gains:</strong> The AFSCME Year 1 offer is worth <strong style="color: var(--accent-afscme);">${fmt.format(
      gain_Y1_total
    )} MORE</strong> than OHSU's.<br>`;
    boxHtml += `<span style="font-size: 0.9em; color: #666; margin-left: 10px;">(${fmt.format(
      gain_Y1_wages
    )} in better wages + ${fmt.format(afscmeRetro)} in back pay)</span></p>`;

    // Section 3: Bottom Line (UPDATED LOGIC FOR CLARITY)
    boxHtml += `<div class="strike-net-context"><strong>Bottom Line:</strong> `;
    if (netY1 >= 0) {
      boxHtml += `You end up <strong class="diff-positive">${fmt.format(
        netY1
      )} ahead</strong> in Year 1.`;
    } else if (netY2 >= 0) {
      // Explicitly state Y1 is a loss, but Y2 recovers it.
      boxHtml += `You are behind in Year 1, but you recoup all losses and end up <strong class="diff-positive">${fmt.format(
        netY2
      )} ahead</strong> by Year 2.`;
    } else if (netY3 >= 0) {
      boxHtml += `You are behind for the first two years, but you recoup all losses and end up <strong class="diff-positive">${fmt.format(
        netY3
      )} ahead</strong> by Year 3.`;
    } else {
      boxHtml += `Based on this duration, strike costs would exceed the cumulative 3-year gains by <strong class="diff-negative">${fmt.format(
        Math.abs(netY3)
      )}</strong>.`;
    }
    boxHtml += `</div>`;

    strikeImpactBox.innerHTML = boxHtml;
    strikeImpactBox.style.display = 'block';
  } else {
    strikeImpactBox.style.display = 'none';
  }

  // --- 4. RENDER TABLE ---
  html += row(1, y1_cpi, y1_o, y1_a, annualHours);
  oGross += y1_o.rate * annualHours;
  aGross += y1_a.rate * annualHours;

  oGross += ohsuCash;
  aGross += afscmeRetro;
  html += `
    <tr style="background:#eef6fc;">
        <td><strong>Immediate Cash</strong></td>
        <td class="cpi-col" style="opacity:0.5;"><small>N/A</small></td>
        <td class="ohsu-col">
            <div class="rate-cell">${fmt.format(ohsuCash)}</div>
            <span class="reason-tag">${
              strike ? 'Strike declared (Bonus lost)' : 'Ratification Bonus'
            }</span>
        </td>
        <td class="afscme-col">
             <div class="rate-cell">${fmt.format(afscmeRetro)}</div>
             <span class="reason-tag">Est. Retro Pay (~${WEEKS_RETRO} weeks)</span>
        </td>
        <td class="${
          afscmeRetro - ohsuCash > 0 ? 'diff-positive' : 'diff-negative'
        }">
            ${afscmeRetro - ohsuCash > 0 ? '+' : ''}${fmt.format(
    afscmeRetro - ohsuCash
  )}
        </td>
    </tr>`;

  html += row(2, y2_cpi, y2_o, y2_a, annualHours);
  oGross += y2_o.rate * annualHours;
  aGross += y2_a.rate * annualHours;

  html += row(3, y3_cpi, y3_o, y3_a, annualHours);
  oGross += y3_o.rate * annualHours;
  aGross += y3_a.rate * annualHours;

  // RENDER FINAL
  document.getElementById('tableBody').innerHTML = html;
  document.getElementById('ohsuTotalGross').innerText = fmt.format(oGross);
  document.getElementById('afscmeTotalGross').innerText = fmt.format(aGross);
  document.getElementById('finalDiff').innerText = fmt.format(aGross - oGross);
  document.getElementById('ohsuBonusNote').innerText =
    ohsuCash > 0
      ? `Includes ${fmt.format(ohsuCash)} bonus`
      : 'No ratification bonus (Strike)';
  document.getElementById('resultsArea').style.display = 'block';
}

function renderDual(hourlyRate, annualHours) {
  return `
        <div class="rate-cell">${fmt.format(hourlyRate)}/hr</div>
        <div class="annual-sub">(${fmt.format(
          hourlyRate * annualHours
        )}/yr)</div>
    `;
}

function row(year, cpi, oRes, aRes, annualHours) {
  let hDiff = aRes.rate - oRes.rate;
  return `<tr>
        <td><strong>Year ${year}</strong></td>
        <td class="cpi-col">${renderDual(cpi, annualHours)}</td>
        <td class="ohsu-col ${oRes.rate < cpi ? 'losing-to-inflation' : ''}">
            ${renderDual(oRes.rate, annualHours)}
            <span class="reason-tag">${oRes.reason}</span>
        </td>
        <td class="afscme-col ${aRes.rate < cpi ? 'losing-to-inflation' : ''}">
             ${renderDual(aRes.rate, annualHours)}
             <span class="reason-tag">${aRes.reason}</span>
        </td>
        <td class="${hDiff > 0 ? 'diff-positive' : 'diff-negative'}">
            ${hDiff > 0 ? '+' : ''}${fmt.format(hDiff * annualHours)}
             <div class="annual-sub" style="opacity: 0.7">
                (${hDiff > 0 ? '+' : ''}${fmt.format(hDiff)}/hr)
            </div>
        </td>
    </tr>`;
}

document.querySelector('#runBtn').addEventListener('click', calculate);
