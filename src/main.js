import './style.css';

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

// --- DYNAMIC RETRO DATE CALCULATION ---
// Calculates weeks from July 1, 2025 to today
const retroStartDate = new Date('2025-07-01');
const currentDate = new Date(); // Uses user's current date
const oneWeek = 1000 * 60 * 60 * 24 * 7;
// Math.max to ensure we don't get negative weeks if system clock is weird
const WEEKS_RETRO = Math.max(0, (currentDate - retroStartDate) / oneWeek);

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
  
  // Floor check
  let hitFloor = tempRate < floor;
  let finalRate = hitFloor ? floor : tempRate;
  
  let reason = hitFloor
    ? `Bumped to ${fmt.format(floor)} floor`
    : useFlat && flat > 0
    ? `Used flat ${fmt.format(flat)} increase`
    : `Used ${(pct * 100).toFixed(2)}% increase`; // Changed to 2 decimals for 3.25%
    
  return { rate: finalRate, reason: reason };
}

function calculate() {
  const startVal = parseFloat(document.getElementById('startVal').value);
  const fte = parseFloat(document.getElementById('fte').value);
  const cpiPct = parseFloat(document.getElementById('cpiScenario').value);
  // Strike logic removed for this specific comparison as requested, 
  // or treated as 0 for the TA calculation.
  
  const isSalaryInput =
    document.querySelector('input[name="wageType"]:checked').value === 'salary';

  if (!startVal) {
    alert('Please enter your current pay rate.');
    return;
  }

  const annualHours = 2080 * fte;
  let startHourly = isSalaryInput ? startVal / annualHours : startVal;

  let taRate = startHourly, // Previously OHSU
    askRate = startHourly,  // Previously Union/AFSCME
    cpiRate = startHourly;
    
  let taGross = 0,
    askGross = 0;
  let html = '';

  // --- 1. CALCULATE YEARLY RATES ---
  
  // YEAR 1
  let y1_cpi = startHourly * (1 + cpiPct);
  
  // TA: 4% or 1.25, Floor 20
  let y1_ta = applyRaise(taRate, 0.04, 1.25, 20.0);
  
  // ASK: 8% or 5.00, Floor 23
  let y1_ask = applyRaise(askRate, 0.08, 5.0, 23.0);

  // YEAR 2
  let y2_cpi = y1_cpi * (1 + cpiPct);
  
  // TA: 3.25%, Floor 21 (Assuming July 1 date for simplicity of chart)
  let y2_ta = applyRaise(y1_ta.rate, 0.0325, 0, 21.0);
  
  // ASK: 5% or 2.00, Floor 25
  let y2_ask = applyRaise(y1_ask.rate, 0.05, 2.0, 25.0);

  // YEAR 3
  let y3_cpi = y2_cpi * (1 + cpiPct);
  
  // TA: 3%, Floor 23
  let y3_ta = applyRaise(y2_ta.rate, 0.03, 0, 23.0);
  
  // ASK: 5% or 2.00, Floor 27
  let y3_ask = applyRaise(y2_ask.rate, 0.05, 2.0, 27.0);

  // --- 2. CALCULATE CASH/BONUS/RETRO ---
  
  // TA Bonus Logic
  // $4500 for 0.5-1.0 FTE, $2250 for < 0.5 FTE
  let taBonus = fte >= 0.5 ? 4500 : 2250;

  // Ask Retro Logic (Back to July 1 2025)
  // Retro is usually paid on the difference between New Rate and Old Rate
  let hourlyIncreaseAsk = y1_ask.rate - startHourly;
  let weeklyHours = fte * 40;
  // Calculate Retro for the Ask side
  let askRetro = hourlyIncreaseAsk * weeklyHours * WEEKS_RETRO;

  // --- 3. RENDER TABLE ---
  
  // Row 1
  html += row(1, y1_cpi, y1_ta, y1_ask, annualHours);
  taGross += y1_ta.rate * annualHours;
  askGross += y1_ask.rate * annualHours;

  // Add Cash Row (Bonus vs Retro)
  taGross += taBonus;
  askGross += askRetro;
  
  html += `
    <tr style="background:#eef6fc;">
        <td><strong>Immediate Cash</strong></td>
        <td class="cpi-col" style="opacity:0.5;"><small>N/A</small></td>
        <td class="ta-col">
            <div class="rate-cell">${fmt.format(taBonus)}</div>
            <span class="reason-tag">Ratification Bonus</span>
        </td>
        <td class="ask-col">
             <div class="rate-cell">${fmt.format(askRetro)}</div>
             <span class="reason-tag">Calculated Retro (~${Math.floor(WEEKS_RETRO)} wks)</span>
        </td>
        <td class="${
          askRetro - taBonus > 0 ? 'diff-positive' : 'diff-negative'
        }">
            ${askRetro - taBonus > 0 ? '+' : ''}${fmt.format(askRetro - taBonus)}
        </td>
    </tr>`;

  // Row 2
  html += row(2, y2_cpi, y2_ta, y2_ask, annualHours);
  taGross += y2_ta.rate * annualHours;
  askGross += y2_ask.rate * annualHours;

  // Row 3
  html += row(3, y3_cpi, y3_ta, y3_ask, annualHours);
  taGross += y3_ta.rate * annualHours;
  askGross += y3_ask.rate * annualHours;

  // RENDER FINAL
  document.getElementById('tableBody').innerHTML = html;
  
  // Update Summary Boxes
  document.getElementById('taTotalGross').innerText = fmt.format(taGross);
  document.getElementById('askTotalGross').innerText = fmt.format(askGross);
  document.getElementById('finalDiff').innerText = fmt.format(askGross - taGross);
  
  document.getElementById('taBonusNote').innerText = 
    `Includes ${fmt.format(taBonus)} ratification bonus`;
    
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

function row(year, cpi, taRes, askRes, annualHours) {
  let hDiff = askRes.rate - taRes.rate;
  return `<tr>
        <td><strong>Year ${year}</strong></td>
        <td class="cpi-col">${renderDual(cpi, annualHours)}</td>
        <td class="ta-col ${taRes.rate < cpi ? 'losing-to-inflation' : ''}">
            ${renderDual(taRes.rate, annualHours)}
            <span class="reason-tag">${taRes.reason}</span>
        </td>
        <td class="ask-col ${askRes.rate < cpi ? 'losing-to-inflation' : ''}">
             ${renderDual(askRes.rate, annualHours)}
             <span class="reason-tag">${askRes.reason}</span>
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
