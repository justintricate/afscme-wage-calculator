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
  // STRIKE LOGIC: If days > 0, strike happened.
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

  // --- PRE-CALCULATE YEARLY DIFFERENCES ---
  let y1_cpi = startHourly * (1 + cpiPct);
  let y1_o = applyRaise(oRate, 0.04, 1.25, 22.0);
  let y1_a = applyRaise(aRate, 0.08, 5.0, 23.0);
  let y1_diff = (y1_a.rate - y1_o.rate) * annualHours;

  let y2_cpi = y1_cpi * (1 + cpiPct);
  let y2_o = applyRaise(y1_o.rate, 0.025, 0, 22.55);
  let y2_a = applyRaise(y1_a.rate, 0.05, 2.0, 25.0);
  let y2_diff = (y2_a.rate - y2_o.rate) * annualHours;

  let y3_cpi = y2_cpi * (1 + cpiPct);
  let y3_o = applyRaise(y2_o.rate, 0.025, 0, 23.11);
  let y3_a = applyRaise(y2_a.rate, 0.05, 2.0, 27.0);
  let y3_diff = (y3_a.rate - y3_o.rate) * annualHours;

  // --- STRIKE TRADE-OFF ANALYSIS ---
  const strikeImpactBox = document.getElementById('strikeImpactBox');
  if (strike) {
    const totalLost = startHourly * 8 * fte * strikeDays;
    document.getElementById('strikeDaysText').innerText = strikeDays;
    document.getElementById('strikeLostWages').innerText =
      fmt.format(totalLost);

    let netY1 = y1_diff - totalLost;
    let netY2 = y1_diff + y2_diff - totalLost;
    let netY3 = y1_diff + y2_diff + y3_diff - totalLost;

    let netMsg = '';
    if (netY1 >= 0) {
      netMsg = `With these losses, the AFSCME offer puts you <strong class="diff-positive">${fmt.format(
        netY1
      )} ahead</strong> in Year 1 alone.`;
    } else if (netY2 >= 0) {
      netMsg = `You would be behind in Year 1, but the contract gains mean you come out <strong class="diff-positive">${fmt.format(
        netY2
      )} ahead</strong> by the end of Year 2.`;
    } else if (netY3 >= 0) {
      netMsg = `It will take time to recoup the losses, but you will be <strong class="diff-positive">${fmt.format(
        netY3
      )} ahead</strong> over the full 3-year contract.`;
    } else {
      netMsg = `Based on this duration, the strike losses would exceed the contract gains over 3 years by <strong class="diff-negative">${fmt.format(
        Math.abs(netY3)
      )}</strong>.`;
    }
    document.getElementById('strikeNetContext').innerHTML = netMsg;
    strikeImpactBox.style.display = 'block';
  } else {
    strikeImpactBox.style.display = 'none';
  }

  // --- RENDER ROWS ---
  html += row(1, y1_cpi, y1_o, y1_a, annualHours);
  oGross += y1_o.rate * annualHours;
  aGross += y1_a.rate * annualHours;

  // Immediate Cash
  let ohsuCash = !strike ? (fte >= 0.5 ? 1250 : 625) : 0;
  let hourlyIncrease = y1_a.rate - startHourly;
  let weeklyHours = fte * 40;
  let afscmeRetro = hourlyIncrease * weeklyHours * WEEKS_RETRO;
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
